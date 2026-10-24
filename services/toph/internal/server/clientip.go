package server

import (
	"net/http"
	"net/netip"
	"strings"
)

type clientIPResolver struct {
	trusted []netip.Prefix
}

func newClientIPResolver(trusted []netip.Prefix) clientIPResolver {
	// A local reverse proxy is always trusted. Remote proxies must be listed
	// explicitly so a direct client cannot spoof X-Forwarded-For.
	trusted = append(trusted,
		netip.MustParsePrefix("127.0.0.0/8"),
		netip.MustParsePrefix("::1/128"),
	)
	return clientIPResolver{trusted: trusted}
}

func (c clientIPResolver) resolve(r *http.Request) string {
	remote, ok := parseRemoteAddr(r.RemoteAddr)
	if !ok {
		return r.RemoteAddr
	}
	if !c.isTrusted(remote) {
		return remote.String()
	}
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		for i := len(parts) - 1; i >= 0; i-- {
			addr, ok := parseIP(strings.TrimSpace(parts[i]))
			if ok && !c.isTrusted(addr) {
				return addr.String()
			}
		}
	}
	if real := strings.TrimSpace(r.Header.Get("X-Real-IP")); real != "" {
		if addr, ok := parseIP(real); ok {
			return addr.String()
		}
	}
	return remote.String()
}

func (c clientIPResolver) isTrusted(addr netip.Addr) bool {
	for _, prefix := range c.trusted {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

func parseRemoteAddr(value string) (netip.Addr, bool) {
	if parsed, err := netip.ParseAddrPort(value); err == nil {
		return parsed.Addr().Unmap(), true
	}
	return parseIP(value)
}

func parseIP(value string) (netip.Addr, bool) {
	if parsed, err := netip.ParseAddrPort(value); err == nil {
		return parsed.Addr().Unmap(), true
	}
	if parsed, err := netip.ParseAddr(value); err == nil {
		return parsed.Unmap(), true
	}
	return netip.Addr{}, false
}

func parseRemoteAddrString(value string) string {
	if addr, ok := parseRemoteAddr(value); ok {
		return addr.String()
	}
	return value
}
