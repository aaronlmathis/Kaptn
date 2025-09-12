import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
// import { SiteSearch } from "@/components/site-search"
import { IconCloudUpload } from "@tabler/icons-react"
import { useNavigation } from "@/contexts/navigation-context"
import { getRouteMeta } from "@/routeMeta"


export function SiteHeader() {
  const { pageTitle, currentPath } = useNavigation()

  // Derive breadcrumbs from route meta; fallback to pageTitle
  const meta = typeof window !== 'undefined' ? getRouteMeta(currentPath) : null

  const renderBreadcrumb = () => {
    if (!meta) {
      return (
        <h1 className="text-base font-medium">{pageTitle}</h1>
      )
    }

    // Section page: just section label
    if (!meta.page) {
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{meta.section}</span>
        </div>
      )
    }

    // Child page: Section > Page (section clickable)
    return (
      <div className="flex items-center gap-2 text-sm">
        <a href={meta.sectionHref} className="font-medium hover:underline">
          {meta.section}
        </a>
        <span className="text-muted-foreground">›</span>
        <span className="font-medium">{meta.page}</span>
      </div>
    )
  }

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-muted/30 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <div className="flex flex-col">{renderBreadcrumb()}</div>
        <div className="ml-auto flex items-center gap-2">

          {/* <SiteSearch /> */}
          {/* <SessionDebugPopover /> */}
          <Button variant="ghost" size="sm" className="flex items-center gap-2" asChild>
            <a href="/apply">
              <IconCloudUpload className="h-4 w-4" />
              <span className="hidden sm:inline">Apply Config</span>
            </a>
          </Button>
          <Button variant="ghost" asChild size="sm" className="hidden sm:flex">
            <a
              href="https://github.com/aaronlmathis/kaptn"
              rel="noopener noreferrer"
              target="_blank"
              className="dark:text-foreground"
            >
              GitHub
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
