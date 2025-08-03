import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useNavigation } from "@/contexts/navigation-context"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export function SiteHeader() {
  const { breadcrumbs } = useNavigation()
  
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((item, index) => (
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
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" asChild size="sm" className="hidden sm:flex">
            <a
              href="https://github.com/shadcn-ui/ui/tree/main/apps/v4/app/(examples)/dashboard"
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
