export default function formatDate(date: Date): string {
    return `${two(date.getFullYear(), 4)}-${two(date.getMonth() + 1)}-${two(date.getDate())}_${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`
}

function two(num: number, len?: number): string {
    return num.toString(10).padStart(len || 2, "0");
}