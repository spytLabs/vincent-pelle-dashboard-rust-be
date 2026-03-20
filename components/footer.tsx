import { SpytLabsLogo } from "./spytlabs-logo"

export function Footer() {
    return (
        <footer className="w-full py-4 mt-auto border-t bg-background/50 backdrop-blur">
            <div className="container mx-auto px-4 flex items-center justify-center gap-3">
                <span className="text-sm font-medium text-muted-foreground/80">
                    Copyright © 2026
                </span>
                <SpytLabsLogo className="text-sm" />
            </div>
        </footer>
    )
}
