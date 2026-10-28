import { forwardRef, type HTMLAttributes } from "react";

type IconProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const glyphs = {
  AlertTriangle: "warning",
  ArrowLeft: "arrow_back",
  ArrowRight: "arrow_forward",
  ArrowUp: "arrow_upward",
  AtSign: "alternate_email",
  Bell: "notifications",
  BookOpen: "menu_book",
  Bot: "smart_toy",
  Boxes: "widgets",
  Braces: "data_object",
  Check: "check",
  CheckCheck: "done_all",
  ChevronDown: "keyboard_arrow_down",
  ChevronRight: "chevron_right",
  CircleAlert: "error",
  CircleCheck: "check_circle",
  Container: "deployed_code",
  Database: "database",
  Download: "download",
  ExternalLink: "open_in_new",
  FileCode2: "code",
  FileDiff: "difference",
  FileJson: "data_object",
  FilePlus2: "note_add",
  FileText: "description",
  FileType: "text_snippet",
  Files: "folder_copy",
  Folder: "folder",
  FolderGit2: "folder_special",
  FolderOpen: "folder_open",
  FolderPlus: "create_new_folder",
  Gem: "diamond",
  GitBranch: "account_tree",
  Globe2: "public",
  HardDrive: "hard_drive",
  History: "history",
  Image: "image",
  ImagePlus: "add_photo_alternate",
  Info: "info",
  LayoutPanelLeft: "view_sidebar",
  Lock: "lock",
  LogOut: "logout",
  Minus: "remove",
  Monitor: "desktop_windows",
  Moon: "dark_mode",
  Package: "inventory_2",
  Palette: "palette",
  Pencil: "edit",
  Play: "play_arrow",
  PlugZap: "power",
  Plus: "add",
  RefreshCw: "refresh",
  RotateCcw: "restart_alt",
  Rows3: "table_rows",
  Save: "save",
  Search: "search",
  Server: "dns",
  Settings: "settings",
  Settings2: "tune",
  ShieldCheck: "verified_user",
  Sparkles: "stars",
  Square: "stop",
  Sun: "light_mode",
  Table2: "table",
  TerminalSquare: "terminal",
  Timer: "timer",
  Trash2: "delete",
  TriangleAlert: "warning",
  Type: "text_fields",
  Undo2: "undo",
  UserRound: "account_circle",
  Wifi: "wifi",
  Wrench: "build",
  X: "close",
} as const;

type GlyphName = keyof typeof glyphs;

const IconBase = forwardRef<HTMLSpanElement, IconProps & { glyph: GlyphName }>(function IconBase(
  { glyph, size = 16, color, strokeWidth: _strokeWidth, className = "", style, ...props },
  ref,
) {
  const data = glyphs[glyph];
  return (
    <span
      ref={ref}
      className={`toph-icon ${className}`.trim()}
      style={{ fontSize: size, color, width: size, height: size, ...style }}
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
    >
      <span className="toph-icon-material material-symbols-rounded">{data}</span>
    </span>
  );
});

export const AlertTriangle = forwardRef<HTMLSpanElement, IconProps>(function AlertTriangle(props, ref) {
  return <IconBase {...props} glyph="AlertTriangle" ref={ref} />;
});

export const ArrowLeft = forwardRef<HTMLSpanElement, IconProps>(function ArrowLeft(props, ref) {
  return <IconBase {...props} glyph="ArrowLeft" ref={ref} />;
});

export const ArrowRight = forwardRef<HTMLSpanElement, IconProps>(function ArrowRight(props, ref) {
  return <IconBase {...props} glyph="ArrowRight" ref={ref} />;
});

export const ArrowUp = forwardRef<HTMLSpanElement, IconProps>(function ArrowUp(props, ref) {
  return <IconBase {...props} glyph="ArrowUp" ref={ref} />;
});

export const AtSign = forwardRef<HTMLSpanElement, IconProps>(function AtSign(props, ref) {
  return <IconBase {...props} glyph="AtSign" ref={ref} />;
});

export const Bell = forwardRef<HTMLSpanElement, IconProps>(function Bell(props, ref) {
  return <IconBase {...props} glyph="Bell" ref={ref} />;
});

export const BookOpen = forwardRef<HTMLSpanElement, IconProps>(function BookOpen(props, ref) {
  return <IconBase {...props} glyph="BookOpen" ref={ref} />;
});

export const Bot = forwardRef<HTMLSpanElement, IconProps>(function Bot(props, ref) {
  return <IconBase {...props} glyph="Bot" ref={ref} />;
});

export const Boxes = forwardRef<HTMLSpanElement, IconProps>(function Boxes(props, ref) {
  return <IconBase {...props} glyph="Boxes" ref={ref} />;
});

export const Braces = forwardRef<HTMLSpanElement, IconProps>(function Braces(props, ref) {
  return <IconBase {...props} glyph="Braces" ref={ref} />;
});

export const Check = forwardRef<HTMLSpanElement, IconProps>(function Check(props, ref) {
  return <IconBase {...props} glyph="Check" ref={ref} />;
});

export const CheckCheck = forwardRef<HTMLSpanElement, IconProps>(function CheckCheck(props, ref) {
  return <IconBase {...props} glyph="CheckCheck" ref={ref} />;
});

export const ChevronDown = forwardRef<HTMLSpanElement, IconProps>(function ChevronDown(props, ref) {
  return <IconBase {...props} glyph="ChevronDown" ref={ref} />;
});

export const ChevronRight = forwardRef<HTMLSpanElement, IconProps>(function ChevronRight(props, ref) {
  return <IconBase {...props} glyph="ChevronRight" ref={ref} />;
});

export const CircleAlert = forwardRef<HTMLSpanElement, IconProps>(function CircleAlert(props, ref) {
  return <IconBase {...props} glyph="CircleAlert" ref={ref} />;
});

export const CircleCheck = forwardRef<HTMLSpanElement, IconProps>(function CircleCheck(props, ref) {
  return <IconBase {...props} glyph="CircleCheck" ref={ref} />;
});

export const Container = forwardRef<HTMLSpanElement, IconProps>(function Container(props, ref) {
  return <IconBase {...props} glyph="Container" ref={ref} />;
});

export const Database = forwardRef<HTMLSpanElement, IconProps>(function Database(props, ref) {
  return <IconBase {...props} glyph="Database" ref={ref} />;
});

export const Download = forwardRef<HTMLSpanElement, IconProps>(function Download(props, ref) {
  return <IconBase {...props} glyph="Download" ref={ref} />;
});

export const ExternalLink = forwardRef<HTMLSpanElement, IconProps>(function ExternalLink(props, ref) {
  return <IconBase {...props} glyph="ExternalLink" ref={ref} />;
});

export const FileCode2 = forwardRef<HTMLSpanElement, IconProps>(function FileCode2(props, ref) {
  return <IconBase {...props} glyph="FileCode2" ref={ref} />;
});

export const FileDiff = forwardRef<HTMLSpanElement, IconProps>(function FileDiff(props, ref) {
  return <IconBase {...props} glyph="FileDiff" ref={ref} />;
});

export const FileJson = forwardRef<HTMLSpanElement, IconProps>(function FileJson(props, ref) {
  return <IconBase {...props} glyph="FileJson" ref={ref} />;
});

export const FilePlus2 = forwardRef<HTMLSpanElement, IconProps>(function FilePlus2(props, ref) {
  return <IconBase {...props} glyph="FilePlus2" ref={ref} />;
});

export const FileText = forwardRef<HTMLSpanElement, IconProps>(function FileText(props, ref) {
  return <IconBase {...props} glyph="FileText" ref={ref} />;
});

export const FileType = forwardRef<HTMLSpanElement, IconProps>(function FileType(props, ref) {
  return <IconBase {...props} glyph="FileType" ref={ref} />;
});

export const Files = forwardRef<HTMLSpanElement, IconProps>(function Files(props, ref) {
  return <IconBase {...props} glyph="Files" ref={ref} />;
});

export const Folder = forwardRef<HTMLSpanElement, IconProps>(function Folder(props, ref) {
  return <IconBase {...props} glyph="Folder" ref={ref} />;
});

export const FolderGit2 = forwardRef<HTMLSpanElement, IconProps>(function FolderGit2(props, ref) {
  return <IconBase {...props} glyph="FolderGit2" ref={ref} />;
});

export const FolderOpen = forwardRef<HTMLSpanElement, IconProps>(function FolderOpen(props, ref) {
  return <IconBase {...props} glyph="FolderOpen" ref={ref} />;
});

export const FolderPlus = forwardRef<HTMLSpanElement, IconProps>(function FolderPlus(props, ref) {
  return <IconBase {...props} glyph="FolderPlus" ref={ref} />;
});

export const Gem = forwardRef<HTMLSpanElement, IconProps>(function Gem(props, ref) {
  return <IconBase {...props} glyph="Gem" ref={ref} />;
});

export const GitBranch = forwardRef<HTMLSpanElement, IconProps>(function GitBranch(props, ref) {
  return <IconBase {...props} glyph="GitBranch" ref={ref} />;
});

export const Globe2 = forwardRef<HTMLSpanElement, IconProps>(function Globe2(props, ref) {
  return <IconBase {...props} glyph="Globe2" ref={ref} />;
});

export const HardDrive = forwardRef<HTMLSpanElement, IconProps>(function HardDrive(props, ref) {
  return <IconBase {...props} glyph="HardDrive" ref={ref} />;
});

export const History = forwardRef<HTMLSpanElement, IconProps>(function History(props, ref) {
  return <IconBase {...props} glyph="History" ref={ref} />;
});

export const Image = forwardRef<HTMLSpanElement, IconProps>(function Image(props, ref) {
  return <IconBase {...props} glyph="Image" ref={ref} />;
});

export const ImagePlus = forwardRef<HTMLSpanElement, IconProps>(function ImagePlus(props, ref) {
  return <IconBase {...props} glyph="ImagePlus" ref={ref} />;
});

export const Info = forwardRef<HTMLSpanElement, IconProps>(function Info(props, ref) {
  return <IconBase {...props} glyph="Info" ref={ref} />;
});

export const LayoutPanelLeft = forwardRef<HTMLSpanElement, IconProps>(function LayoutPanelLeft(props, ref) {
  return <IconBase {...props} glyph="LayoutPanelLeft" ref={ref} />;
});

export const Lock = forwardRef<HTMLSpanElement, IconProps>(function Lock(props, ref) {
  return <IconBase {...props} glyph="Lock" ref={ref} />;
});

export const LogOut = forwardRef<HTMLSpanElement, IconProps>(function LogOut(props, ref) {
  return <IconBase {...props} glyph="LogOut" ref={ref} />;
});

export const Minus = forwardRef<HTMLSpanElement, IconProps>(function Minus(props, ref) {
  return <IconBase {...props} glyph="Minus" ref={ref} />;
});

export const Monitor = forwardRef<HTMLSpanElement, IconProps>(function Monitor(props, ref) {
  return <IconBase {...props} glyph="Monitor" ref={ref} />;
});

export const Moon = forwardRef<HTMLSpanElement, IconProps>(function Moon(props, ref) {
  return <IconBase {...props} glyph="Moon" ref={ref} />;
});

export const Package = forwardRef<HTMLSpanElement, IconProps>(function Package(props, ref) {
  return <IconBase {...props} glyph="Package" ref={ref} />;
});

export const Palette = forwardRef<HTMLSpanElement, IconProps>(function Palette(props, ref) {
  return <IconBase {...props} glyph="Palette" ref={ref} />;
});

export const Pencil = forwardRef<HTMLSpanElement, IconProps>(function Pencil(props, ref) {
  return <IconBase {...props} glyph="Pencil" ref={ref} />;
});

export const Play = forwardRef<HTMLSpanElement, IconProps>(function Play(props, ref) {
  return <IconBase {...props} glyph="Play" ref={ref} />;
});

export const PlugZap = forwardRef<HTMLSpanElement, IconProps>(function PlugZap(props, ref) {
  return <IconBase {...props} glyph="PlugZap" ref={ref} />;
});

export const Plus = forwardRef<HTMLSpanElement, IconProps>(function Plus(props, ref) {
  return <IconBase {...props} glyph="Plus" ref={ref} />;
});

export const RefreshCw = forwardRef<HTMLSpanElement, IconProps>(function RefreshCw(props, ref) {
  return <IconBase {...props} glyph="RefreshCw" ref={ref} />;
});

export const RotateCcw = forwardRef<HTMLSpanElement, IconProps>(function RotateCcw(props, ref) {
  return <IconBase {...props} glyph="RotateCcw" ref={ref} />;
});

export const Rows3 = forwardRef<HTMLSpanElement, IconProps>(function Rows3(props, ref) {
  return <IconBase {...props} glyph="Rows3" ref={ref} />;
});

export const Save = forwardRef<HTMLSpanElement, IconProps>(function Save(props, ref) {
  return <IconBase {...props} glyph="Save" ref={ref} />;
});

export const Search = forwardRef<HTMLSpanElement, IconProps>(function Search(props, ref) {
  return <IconBase {...props} glyph="Search" ref={ref} />;
});

export const Server = forwardRef<HTMLSpanElement, IconProps>(function Server(props, ref) {
  return <IconBase {...props} glyph="Server" ref={ref} />;
});

export const Settings = forwardRef<HTMLSpanElement, IconProps>(function Settings(props, ref) {
  return <IconBase {...props} glyph="Settings" ref={ref} />;
});

export const Settings2 = forwardRef<HTMLSpanElement, IconProps>(function Settings2(props, ref) {
  return <IconBase {...props} glyph="Settings2" ref={ref} />;
});

export const ShieldCheck = forwardRef<HTMLSpanElement, IconProps>(function ShieldCheck(props, ref) {
  return <IconBase {...props} glyph="ShieldCheck" ref={ref} />;
});

export const Sparkles = forwardRef<HTMLSpanElement, IconProps>(function Sparkles(props, ref) {
  return <IconBase {...props} glyph="Sparkles" ref={ref} />;
});

export const Square = forwardRef<HTMLSpanElement, IconProps>(function Square(props, ref) {
  return <IconBase {...props} glyph="Square" ref={ref} />;
});

export const Sun = forwardRef<HTMLSpanElement, IconProps>(function Sun(props, ref) {
  return <IconBase {...props} glyph="Sun" ref={ref} />;
});

export const Table2 = forwardRef<HTMLSpanElement, IconProps>(function Table2(props, ref) {
  return <IconBase {...props} glyph="Table2" ref={ref} />;
});

export const TerminalSquare = forwardRef<HTMLSpanElement, IconProps>(function TerminalSquare(props, ref) {
  return <IconBase {...props} glyph="TerminalSquare" ref={ref} />;
});

export const Timer = forwardRef<HTMLSpanElement, IconProps>(function Timer(props, ref) {
  return <IconBase {...props} glyph="Timer" ref={ref} />;
});

export const Trash2 = forwardRef<HTMLSpanElement, IconProps>(function Trash2(props, ref) {
  return <IconBase {...props} glyph="Trash2" ref={ref} />;
});

export const TriangleAlert = forwardRef<HTMLSpanElement, IconProps>(function TriangleAlert(props, ref) {
  return <IconBase {...props} glyph="TriangleAlert" ref={ref} />;
});

export const Type = forwardRef<HTMLSpanElement, IconProps>(function Type(props, ref) {
  return <IconBase {...props} glyph="Type" ref={ref} />;
});

export const Undo2 = forwardRef<HTMLSpanElement, IconProps>(function Undo2(props, ref) {
  return <IconBase {...props} glyph="Undo2" ref={ref} />;
});

export const UserRound = forwardRef<HTMLSpanElement, IconProps>(function UserRound(props, ref) {
  return <IconBase {...props} glyph="UserRound" ref={ref} />;
});

export const Wifi = forwardRef<HTMLSpanElement, IconProps>(function Wifi(props, ref) {
  return <IconBase {...props} glyph="Wifi" ref={ref} />;
});

export const Wrench = forwardRef<HTMLSpanElement, IconProps>(function Wrench(props, ref) {
  return <IconBase {...props} glyph="Wrench" ref={ref} />;
});

export const X = forwardRef<HTMLSpanElement, IconProps>(function X(props, ref) {
  return <IconBase {...props} glyph="X" ref={ref} />;
});
