import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
export function formatDate(date, style = "short") {
    if (!date)
        return "—";
    const d = new Date(date);
    if (isNaN(d.getTime()))
        return "—";
    return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: style === "long" ? "long" : "short",
        day: "numeric",
    });
}
export function formatNumber(n) {
    if (n === undefined || n === null)
        return "—";
    return n.toLocaleString();
}
export function truncate(str, length) {
    if (str.length <= length)
        return str;
    return str.slice(0, length) + "…";
}
export function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
//# sourceMappingURL=utils.js.map