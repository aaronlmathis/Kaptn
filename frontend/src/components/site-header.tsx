import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useNavigation } from "@/contexts/navigation-context"
import { IconCloudUpload } from "@tabler/icons-react"



export function SiteHeader() {
  const { breadcrumbs, isHydrated } = useNavigation()

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-muted/30 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        {/* <Breadcrumb>
          <BreadcrumbList>
            {isHydrated ? (
              breadcrumbs.map((item, index) => (
                <div key={index} className="flex items-center">
                  {index > 0 && (
                    <BreadcrumbSeparator className="hidden md:block" />
                  )}
                  <BreadcrumbItem className={index === 0 ? "hidden md:block" : ""}>
                    {index === breadcrumbs.length - 1 ? (
                      <BreadcrumbPage>{item.title}</BreadcrumbPage>
                    ) : item.url ? (
                      <BreadcrumbLink href={item.url}>
                        {item.title}
                      </BreadcrumbLink>
                    ) : (
                      <span className="text-muted-foreground">{item.title}</span>
                    )}
                  </BreadcrumbItem>
                </div>
              ))
            ) : (
              // Render placeholder breadcrumb to prevent layout shift
              <BreadcrumbItem className="opacity-0">
                <BreadcrumbPage>Loading...</BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb> */}
        <div className="ml-auto flex items-center gap-2">
          {/* <SessionDebugPopover /> */}
          <Button variant="default" size="sm" className="flex items-center gap-2" asChild>
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
