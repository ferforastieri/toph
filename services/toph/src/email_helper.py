#!/usr/bin/env python3
"""Toph email helper.

The Rust server starts this script with ``python3`` and writes a single JSON
request to stdin. The script writes a single JSON response to stdout. Only the
Python standard library is used, and credentials are never passed on the
command line.

Actions: ``test``, ``list``, ``read``, ``delete``, ``send`` and ``selftest``.
Every response has the shape ``{"ok": true, ...}`` or
``{"ok": false, "error": "..."}``.
"""

from __future__ import annotations

import base64
import datetime
import email
import email.header
import email.policy
import email.utils
import imaplib
import json
import quopri
import re
import smtplib
import ssl
import sys
from html.parser import HTMLParser

SOCKET_TIMEOUT = 20
SNIPPET_CHARS = 200
MAX_BODY_CHARS = 400_000
MAX_LIST_LIMIT = 100
MAX_FETCH_BYTES = 25 * 1024 * 1024
MAX_RECIPIENTS = 50

SAMPLE_MESSAGE = (
    b"From: Alice <alice@example.com>\r\n"
    b"To: Bob <bob@example.com>\r\n"
    b"Cc: carol@example.com\r\n"
    b"Subject: =?UTF-8?B?T2zDoSBtdW5kbw==?=\r\n"
    b"Date: Tue, 01 Oct 2024 10:00:00 +0000\r\n"
    b"Message-ID: <sample@example.com>\r\n"
    b"MIME-Version: 1.0\r\n"
    b'Content-Type: multipart/mixed; boundary="b"\r\n'
    b"\r\n"
    b"--b\r\n"
    b"Content-Type: text/plain; charset=utf-8\r\n"
    b"Content-Transfer-Encoding: quoted-printable\r\n"
    b"\r\n"
    b"Hello=2C world! This is the body.\r\n"
    b"--b\r\n"
    b"Content-Type: application/pdf\r\n"
    b'Content-Disposition: attachment; filename="report.pdf"\r\n'
    b"Content-Transfer-Encoding: base64\r\n"
    b"\r\n"
    b"JVBERi0=\r\n"
    b"--b--\r\n"
)


class HelperError(Exception):
    """An expected error that is safe to show to the API client."""


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise HelperError("invalid request")
    except Exception:
        emit({"ok": False, "error": "invalid request"})
        return 0

    try:
        action = payload.get("action")
        if action == "test":
            result = do_test(payload)
        elif action == "list":
            result = do_list(payload)
        elif action == "read":
            result = do_read(payload)
        elif action == "delete":
            result = do_delete(payload)
        elif action == "send":
            result = do_send(payload)
        elif action == "selftest":
            result = do_selftest()
        else:
            raise HelperError("unknown email action")
    except Exception as exc:  # noqa: BLE001 - errors are returned as JSON
        emit({"ok": False, "error": sanitize_error(exc, payload)})
        return 0

    result = dict(result)
    result["ok"] = True
    emit(result)
    return 0


def emit(value: dict) -> None:
    print(json.dumps(value, ensure_ascii=False))


def sanitize_error(exc: Exception, payload: dict) -> str:
    message = str(exc) or exc.__class__.__name__
    for key in ("imap", "smtp"):
        server = payload.get(key)
        if not isinstance(server, dict):
            continue
        password = server.get("password")
        if isinstance(password, str) and password:
            message = message.replace(password, "***")
    message = re.sub(r"[\r\n]+", " ", message).strip()
    return message[:500] or "email operation failed"


def required(settings: dict, key: str) -> str:
    value = settings.get(key)
    if not isinstance(value, str) or not value.strip():
        raise HelperError(f"missing {key}")
    return value.strip()


def connection_settings(payload: dict, key: str) -> dict:
    settings = payload.get(key)
    if not isinstance(settings, dict):
        raise HelperError(f"missing {key} settings")
    security = str(settings.get("security") or "ssl").strip().lower()
    if security not in ("ssl", "starttls", "none"):
        raise HelperError("invalid TLS mode")
    return settings


def tls_context() -> ssl.SSLContext:
    # The default context checks certificates and hostnames. Mail providers
    # with self-signed certificates are intentionally not supported: users
    # should install their CA in the system trust store.
    return ssl.create_default_context()


def imap_connect(payload: dict) -> imaplib.IMAP4:
    settings = connection_settings(payload, "imap")
    host = required(settings, "host")
    security = str(settings.get("security") or "ssl").strip().lower()
    port = int(settings.get("port") or (993 if security == "ssl" else 143))
    user = required(settings, "user")
    password = settings.get("password")
    if not isinstance(password, str):
        password = ""

    if security == "ssl":
        conn = imaplib.IMAP4_SSL(
            host, port, ssl_context=tls_context(), timeout=SOCKET_TIMEOUT
        )
    else:
        conn = imaplib.IMAP4(host, port, timeout=SOCKET_TIMEOUT)
        if security == "starttls":
            conn.starttls(ssl_context=tls_context())
    try:
        conn.login(user, password)
    except Exception:
        close_imap(conn)
        raise
    return conn


def smtp_connect(payload: dict) -> smtplib.SMTP:
    settings = connection_settings(payload, "smtp")
    host = required(settings, "host")
    security = str(settings.get("security") or "ssl").strip().lower()
    port = int(settings.get("port") or (465 if security == "ssl" else 587))
    user = required(settings, "user")
    password = settings.get("password")
    if not isinstance(password, str):
        password = ""

    if security == "ssl":
        server = smtplib.SMTP_SSL(
            host, port, timeout=SOCKET_TIMEOUT, context=tls_context()
        )
    else:
        server = smtplib.SMTP(host, port, timeout=SOCKET_TIMEOUT)
        server.ehlo()
        if security == "starttls":
            server.starttls(context=tls_context())
            server.ehlo()
    try:
        server.login(user, password)
    except Exception:
        close_smtp(server)
        raise
    return server


def close_imap(conn: imaplib.IMAP4) -> None:
    try:
        conn.logout()
    except Exception:
        pass


def close_smtp(server: smtplib.SMTP) -> None:
    try:
        server.quit()
    except Exception:
        pass


def select_inbox(conn: imaplib.IMAP4, readonly: bool) -> None:
    status, _ = conn.select("INBOX", readonly=readonly)
    if status != "OK":
        raise HelperError("could not open INBOX")


def do_test(payload: dict) -> dict:
    conn = imap_connect(payload)
    try:
        select_inbox(conn, readonly=True)
    finally:
        close_imap(conn)

    server = smtp_connect(payload)
    try:
        server.noop()
    finally:
        close_smtp(server)

    return {"imap": "ok", "smtp": "ok"}


def do_list(payload: dict) -> dict:
    limit = payload.get("limit")
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 20
    limit = max(1, min(limit, MAX_LIST_LIMIT))

    conn = imap_connect(payload)
    try:
        select_inbox(conn, readonly=True)
        status, data = conn.uid("search", None, "ALL")
        if status != "OK":
            raise HelperError("could not list inbox")
        raw_uids = data[0] if data else b""
        uids = raw_uids.split() if isinstance(raw_uids, (bytes, bytearray)) else []
        chosen = uids[-limit:][::-1]

        messages = []
        for uid in chosen:
            uid_text = uid.decode("ascii", errors="replace")
            message, flags = fetch_summary(conn, uid_text)
            if message is None:
                continue
            messages.append(summarize(message, uid_text, flags))
        return {"messages": messages}
    finally:
        close_imap(conn)


def fetch_summary(conn: imaplib.IMAP4, uid: str):
    """Fetch headers plus a small body excerpt, without downloading the rest."""
    status, data = conn.uid(
        "fetch",
        uid,
        "(FLAGS BODY.PEEK[HEADER.FIELDS "
        "(FROM SUBJECT DATE CONTENT-TYPE CONTENT-TRANSFER-ENCODING)] "
        "BODY.PEEK[TEXT]<0.4096>)",
    )
    if status != "OK":
        return None, ""
    meta, literals = parse_fetch(data)
    flags = parse_flags(meta)
    headers = literals[0] if literals else b""
    body = b""
    if len(literals) > 1:
        body = literals[1]
    elif literals and is_header_literal(literals[0]):
        headers = literals[0]
    raw = headers.rstrip() + b"\r\n\r\n" + body if body else headers
    try:
        message = email.message_from_bytes(raw, policy=email.policy.default)
    except Exception:
        try:
            message = email.message_from_bytes(headers, policy=email.policy.default)
        except Exception:
            return None, flags
    return message, flags


def fetch_full(conn: imaplib.IMAP4, uid: str):
    status, data = conn.uid("fetch", uid, "(FLAGS BODY.PEEK[])")
    if status != "OK":
        return None, ""
    meta, literals = parse_fetch(data)
    flags = parse_flags(meta)
    raw = b""
    for literal in literals:
        if len(literal) > len(raw):
            raw = literal
    if not raw:
        return None, flags
    return raw, flags


def fetch_size(conn: imaplib.IMAP4, uid: str):
    status, data = conn.uid("fetch", uid, "(RFC822.SIZE)")
    if status != "OK":
        return None
    meta, _ = parse_fetch(data)
    match = re.search(rb"RFC822\.SIZE\s+(\d+)", meta, re.I)
    return int(match.group(1)) if match else None


def parse_fetch(data):
    meta = []
    literals = []
    for item in data or []:
        if isinstance(item, tuple):
            if item[0]:
                meta.append(bytes(item[0]))
            if len(item) >= 2 and item[1] is not None:
                literals.append(bytes(item[1]))
        elif isinstance(item, (bytes, bytearray)):
            meta.append(bytes(item))
    return b" ".join(meta), literals


def parse_flags(meta: bytes) -> str:
    match = re.search(rb"FLAGS\s*\(([^)]*)\)", meta, re.I)
    return match.group(1).decode("ascii", errors="replace") if match else ""


def is_header_literal(value: bytes) -> bool:
    return b":" in value.split(b"\r\n", 1)[0]


def summarize(message, uid: str, flags: str) -> dict:
    text = message_body(message, "plain")
    if not text:
        text = html_to_text(message_body(message, "html"))
    return {
        "uid": str(uid),
        "from": decode_header(message.get("From")),
        "subject": decode_header(message.get("Subject")),
        "date": format_date(message.get("Date")),
        "seen": "\\seen" in flags.lower(),
        "snippet": collapse(text)[:SNIPPET_CHARS],
    }


def do_read(payload: dict) -> dict:
    uid = message_uid(payload)
    conn = imap_connect(payload)
    try:
        select_inbox(conn, readonly=True)
        size = fetch_size(conn, uid)
        if size is not None and size > MAX_FETCH_BYTES:
            raise HelperError("message is too large to display")
        raw, flags = fetch_full(conn, uid)
        if raw is None:
            raise HelperError("message not found")
        try:
            message = email.message_from_bytes(raw, policy=email.policy.default)
        except Exception:
            raise HelperError("could not parse message") from None
        return {"message": message_payload(message, uid, flags)}
    finally:
        close_imap(conn)


def message_payload(message, uid: str, flags: str) -> dict:
    text_body = message_body(message, "plain")
    html_body = message_body(message, "html")
    if not text_body and html_body:
        text_body = html_to_text(html_body)
    if not text_body and not message.is_multipart():
        text_body = part_text(message)

    return {
        "uid": str(uid),
        "from": decode_header(message.get("From")),
        "to": decode_header(message.get("To")),
        "cc": decode_header(message.get("Cc")),
        "subject": decode_header(message.get("Subject")),
        "date": format_date(message.get("Date")),
        "seen": "\\seen" in flags.lower(),
        "snippet": collapse(text_body)[:SNIPPET_CHARS],
        "text": text_body[:MAX_BODY_CHARS],
        "html": html_body[:MAX_BODY_CHARS],
        "attachments": attachment_names(message),
        "messageId": decode_header(message.get("Message-ID")),
        "inReplyTo": decode_header(message.get("In-Reply-To")),
    }


def do_delete(payload: dict) -> dict:
    uid = message_uid(payload)
    conn = imap_connect(payload)
    try:
        select_inbox(conn, readonly=False)
        trash = find_trash(conn)
        moved = False
        if trash and trash.upper() != "INBOX":
            capabilities = b" ".join(
                item if isinstance(item, bytes) else str(item).encode()
                for item in getattr(conn, "capabilities", ())
            )
            if b"MOVE" in capabilities.upper():
                status, _ = conn.uid("move", uid, imap_quote(trash))
                moved = status == "OK"
            if not moved:
                status, _ = conn.uid("copy", uid, imap_quote(trash))
                if status == "OK":
                    status, _ = conn.uid("store", uid, "+FLAGS", "(\\Deleted)")
                    if status == "OK":
                        conn.expunge()
                        moved = True
        if not moved:
            status, _ = conn.uid("store", uid, "+FLAGS", "(\\Deleted)")
            if status != "OK":
                raise HelperError("could not delete message")
            conn.expunge()
        return {"moved": moved, "trash": trash if moved else ""}
    finally:
        close_imap(conn)


def do_send(payload: dict) -> dict:
    identity = payload.get("identity") or {}
    if not isinstance(identity, dict):
        raise HelperError("missing identity")
    address = str(identity.get("email") or "").strip()
    if "@" not in address:
        raise HelperError("account email is invalid")
    from_name = clean_header(identity.get("fromName") or "")

    request = payload.get("message") or {}
    if not isinstance(request, dict):
        raise HelperError("missing message")
    to_value = clean_header(request.get("to"))
    cc_value = clean_header(request.get("cc"))
    bcc_value = clean_header(request.get("bcc"))
    subject = clean_header(request.get("subject"))
    text = str(request.get("text") or "")
    in_reply_to = clean_header(request.get("inReplyTo"))

    recipients = [
        addr
        for _, addr in email.utils.getaddresses([to_value, cc_value, bcc_value])
        if addr
    ]
    if not recipients:
        raise HelperError("at least one recipient is required")
    if len(recipients) > MAX_RECIPIENTS:
        raise HelperError("too many recipients")

    message = email.message.EmailMessage()
    message["From"] = (
        email.utils.formataddr((from_name, address)) if from_name else address
    )
    if to_value:
        message["To"] = to_value
    if cc_value:
        message["Cc"] = cc_value
    message["Subject"] = subject
    message["Date"] = email.utils.formatdate(localtime=False)
    message_id = email.utils.make_msgid(domain=address.rsplit("@", 1)[-1])
    message["Message-ID"] = message_id
    if in_reply_to:
        message["In-Reply-To"] = in_reply_to
        message["References"] = in_reply_to
    message.set_content(text)

    server = smtp_connect(payload)
    try:
        server.send_message(message, from_addr=address, to_addrs=recipients)
    finally:
        close_smtp(server)
    return {"messageId": message_id}


def do_selftest() -> dict:
    message = email.message_from_bytes(SAMPLE_MESSAGE, policy=email.policy.default)
    summary = summarize(message, "7", "\\Seen")
    full = message_payload(message, "7", "\\Seen")
    if summary["subject"] != "Olá mundo":
        raise HelperError("selftest failed to decode the subject")
    if full["attachments"] != ["report.pdf"]:
        raise HelperError("selftest failed to read the attachment name")
    if "Hello, world!" not in full["text"]:
        raise HelperError("selftest failed to decode the body")
    if not summary["seen"]:
        raise HelperError("selftest failed to read the flags")
    return {"summary": summary, "message": full}


def message_uid(payload: dict) -> str:
    uid = str(payload.get("uid") or "").strip()
    if not re.fullmatch(r"[0-9]+", uid):
        raise HelperError("invalid message uid")
    return uid


def message_body(message, subtype: str) -> str:
    try:
        part = message.get_body(preferencelist=(subtype,))
        if part is not None:
            return part_text(part)
    except Exception:
        pass

    if not message.is_multipart():
        content_type = message.get_content_type()
        if content_type == f"text/{subtype}":
            return part_text(message)
    return ""


def part_text(part) -> str:
    try:
        payload = part.get_payload(decode=True)
    except Exception:
        payload = None

    if payload is None:
        raw = part.get_payload()
        if isinstance(raw, list):
            return ""
        if not isinstance(raw, str):
            return ""
        transfer = str(part.get("Content-Transfer-Encoding") or "").lower()
        try:
            if transfer == "base64":
                payload = base64.b64decode(re.sub(r"\s+", "", raw), validate=False)
            elif transfer == "quoted-printable":
                payload = quopri.decodestring(raw.encode("utf-8", "replace"))
            else:
                payload = raw.encode("utf-8", "replace")
        except Exception:
            return raw

    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except LookupError:
        return payload.decode("utf-8", errors="replace")


def attachment_names(message) -> list:
    names = []
    try:
        parts = message.walk()
    except Exception:
        return names
    for part in parts:
        if part.is_multipart():
            continue
        filename = part.get_filename()
        if filename:
            names.append(decode_header(filename))
        elif part.get_content_disposition() == "attachment":
            names.append(part.get_content_type())
    return list(dict.fromkeys(name for name in names if name))


def decode_header(value) -> str:
    if value is None:
        return ""
    raw = str(value)
    try:
        chunks = []
        for part, charset in email.header.decode_header(raw):
            if isinstance(part, bytes):
                chunks.append(part.decode(charset or "utf-8", errors="replace"))
            else:
                chunks.append(part)
        return collapse("".join(chunks))
    except Exception:
        return collapse(raw)


def format_date(value) -> str:
    if not value:
        return ""
    raw = str(value).strip()
    try:
        parsed = email.utils.parsedate_to_datetime(raw)
        if parsed is None:
            return raw
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.timezone.utc)
        return (
            parsed.astimezone(datetime.timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z")
        )
    except Exception:
        return raw


def clean_header(value) -> str:
    return re.sub(r"[\r\n]+", " ", str(value or "")).strip()


def collapse(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\r", " ").replace("\n", " ")).strip()


def html_to_text(value: str) -> str:
    if not value:
        return ""
    parser = TextExtractor()
    try:
        parser.feed(value)
        parser.close()
    except Exception:
        return collapse(value)
    return collapse(" ".join(parser.parts))


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skipping = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skipping += 1
        elif tag in ("br", "p", "div", "li", "tr", "table"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skipping:
            self.skipping -= 1
        elif tag in ("p", "div", "li", "tr", "table"):
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.skipping:
            self.parts.append(data)


def find_trash(conn: imaplib.IMAP4):
    try:
        status, data = conn.list()
    except Exception:
        return None
    if status != "OK":
        return None

    fallback = None
    for item in data or []:
        if item is None:
            continue
        line = item.decode("utf-8", errors="replace") if isinstance(item, bytes) else str(item)
        match = re.match(
            r'^\((?P<attrs>[^)]*)\)\s+(?P<delim>NIL|"(?:[^"\\]|\\.)*")\s+(?P<name>.+)$',
            line,
            re.I,
        )
        if not match:
            continue
        attrs = match.group("attrs").lower()
        name = unquote_mailbox(match.group("name"))
        if "\\trash" in attrs or "\\deleted" in attrs:
            return name
        if fallback is None and re.search(r"trash|deleted", name, re.I):
            fallback = name
    return fallback


def unquote_mailbox(value: str) -> str:
    value = value.strip()
    if value.startswith('"') and value.endswith('"'):
        value = value[1:-1]
        value = value.replace('\\"', '"').replace("\\\\", "\\")
    return value


def imap_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


if __name__ == "__main__":
    raise SystemExit(main())
