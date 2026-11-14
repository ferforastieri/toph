/**
 * The app's icon names, all drawn by the Tophs kit (`@toph/ui`'s `Icon`): the
 * same 20px grid, 1.6 stroke and shapes as the screens' own set. Nothing here
 * comes from another icon library; the names are kept so the screens can ask
 * for "a bot", "a folder" or "a warning" in their own words.
 */
import type { SVGProps } from "react";
import { Icon, type IconName } from "@toph/ui";

export interface TophIconProps extends Omit<SVGProps<SVGSVGElement>, "ref" | "name"> {
  /** 20 by default, as the kit draws it; the class (`size-4`) wins when both are set. */
  size?: number | string;
  /** Kept for the screens that pass it: the kit's stroke is fixed at 1.6. */
  strokeWidth?: number;
}

function glyph(name: IconName) {
  return function TophGlyph({ size, className, strokeWidth: _strokeWidth, ...rest }: TophIconProps) {
    const px = typeof size === "number" && (size === 14 || size === 16 || size === 18 || size === 20) ? size : undefined;
    return <Icon name={name} size={px} className={className} {...rest} />;
  };
}

export const AlertTriangle = glyph("alert");
export const TriangleAlert = glyph("alert");
export const CircleAlert = glyph("alert");
export const ArrowDown = glyph("arrowDown");
export const ArrowLeft = glyph("chevronLeft");
export const ArrowRight = glyph("arrowRight");
export const ArrowUp = glyph("arrowUp");
export const Bell = glyph("bell");
export const BookOpen = glyph("book");
export const Bot = glyph("agent");
export const Boxes = glyph("grid");
export const Bug = glyph("executorCodex");
export const Check = glyph("check");
export const ChevronDown = glyph("chevronDown");
export const ChevronRight = glyph("chevronRight");
export const CircleCheck = glyph("checks");
export const Copy = glyph("copy");
export const Database = glyph("database");
export const Download = glyph("download");
export const ExternalLink = glyph("external");
export const FileCode2 = glyph("code");
export const FileDiff = glyph("document");
export const FilePlus2 = glyph("document");
export const Files = glyph("document");
export const Folder = glyph("drive");
export const FolderGit2 = glyph("repo");
export const FolderOpen = glyph("drive");
export const FolderPlus = glyph("drive");
export const GitBranch = glyph("repo");
export const Globe2 = glyph("globe");
export const HardDrive = glyph("drive");
export const History = glyph("clock");
export const Image = glyph("image");
export const ImagePlus = glyph("image");
export const KeyRound = glyph("key");
export const LoaderCircle = glyph("spinner");
export const LogOut = glyph("power");
export const Mail = glyph("mail");
export const MessageCircleQuestion = glyph("question");
export const MessageSquare = glyph("message");
export const MessageSquarePlus = glyph("message");
export const Mic = glyph("mic");
export const Minus = glyph("dash");
export const Moon = glyph("bolt");
export const MoreHorizontal = glyph("more");
export const PanelLeftClose = glyph("sidebar");
export const PanelLeftOpen = glyph("sidebar");
export const Pencil = glyph("edit");
export const Play = glyph("play");
export const PlugZap = glyph("plug");
export const Plus = glyph("plus");
export const RefreshCw = glyph("refresh");
export const Rows3 = glyph("list");
export const Save = glyph("check");
export const Search = glyph("search");
export const Send = glyph("send");
export const Server = glyph("computer");
export const Settings2 = glyph("preference");
export const Sparkles = glyph("bolt");
export const Square = glyph("block");
export const Sun = glyph("bulb");
export const Table2 = glyph("table");
export const TerminalSquare = glyph("code");
export const Timer = glyph("clock");
export const Trash2 = glyph("trash");
export const Type = glyph("bold");
export const Undo2 = glyph("undo");
export const Upload = glyph("upload");
export const Wifi = glyph("cloud");
export const Wrench = glyph("preference");
export const X = glyph("close");

export const ArrowDownToLine = glyph("download");
export const ArrowUpFromLine = glyph("upload");
export const Braces = glyph("code");
export const CircleDot = glyph("dash");
export const CornerDownRight = glyph("arrowRight");
export const Info = glyph("info");
export const Keyboard = glyph("keyboard");
export const ListTree = glyph("list");
export const Maximize = glyph("expand");
export const Minimize = glyph("shrink");
export const Pause = glyph("pause");
export const SplitVertical = glyph("grid");
export const StepForward = glyph("arrowRight");
export const UserRound = glyph("person");
export const Variable = glyph("code");
