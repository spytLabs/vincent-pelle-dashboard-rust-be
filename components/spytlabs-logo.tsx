import * as React from "react"
import { cn } from "@/lib/utils"

export function SpytLabsLogo({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div className={cn("flex items-center gap-1 select-none", className)} {...props}>
            <svg
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-[1.6em] w-auto shrink-0 text-[#5200FF]"
            >
                <polygon points="65,0 15,60 55,60 40,100 90,35 50,35 65,0" fill="currentColor" />
            </svg>
            <span
                className="text-[1.4em] font-medium tracking-tight"
                style={{ color: "#d8b4fe", fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
                spytLabs.
            </span>
        </div>
    )
}
