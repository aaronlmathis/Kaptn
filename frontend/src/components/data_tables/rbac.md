You are a senior full-stack engineer. Build an **RBAC Builder** page for Kaptn (Kubernetes admin UI) using **React + shadcn/ui**. The goal: let admins compose Kubernetes permissions via a **form**, preview the generated **YAML** (Role/ClusterRole + Binding), and **apply** it to the cluster—no raw YAML editing.

## Objectives
- Professional, compact, enterprise-grade UX (shadcn look/feel).
- Zero DB; use live Kubernetes data via backend APIs.
- Support **User** or **Group** identities; cluster-wide or namespaced scope.
- Produce valid Kubernetes **Role/ClusterRole** and **RoleBinding/ClusterRoleBinding**.
- Actions: **Preview YAML**, **Copy**, **Download**, **Dry-Run**, **Apply**.
- Persist in-progress draft in localStorage.

## UI/UX (shadcn) (content area)

  - **Left column (Form)** in a shadcn `Card`:
    - Identity section:
      - Identity type: `User | Group` (RadioGroup).
      - Identifier input (Combobox with search & free-text, e.g., `email:alice@example.com` or `kaptn-admins-group`).
	  - `GET /api/v1/identities` is available to populate list of deduplicated identities scraped from bindings.
    - Scope section:
      - Scope toggle: `Cluster` or `Namespace`.
      - Namespace selector (Combobox, multi-select disabled; populate from API; hidden if Cluster).
    - Permissions Builder:
      - Repeating rows list; each row has:
        - API Group (Combobox; include `""` core, `apps`, `batch`, etc., from API).
        - Resources (multi-select Combobox; options from API discovery for the selected group).
        - Resource Names (optional, comma-separated input).
        - Verbs (CheckboxGroup with common verbs: `get, list, watch, create, update, patch, delete, deletecollection`; Select-All toggle).
      - Buttons: **Add Permission**, **Remove** (per row), drag handle to reorder rows.
    - Metadata:
      - Name (auto-generated slug; editable).
      - Labels/annotations (optional key/value).
    - Footer Actions (sticky): **Preview YAML**, **Reset**, **Save Draft**.
  - **Right column (Preview/Actions)** in a shadcn `Card`:
    - Tabs: `YAML` | `Summary`.
    - YAML shown in a `<pre>` code block with monospace and copy button.
    - Buttons row: **Copy**, **Download**, **Dry-Run**, **Apply**.
    - Status area: result of dry-run/apply with success/error alerts.

- Global nav should highlight “RBAC”.
- Keyboard and a11y compliant, descriptive labels, helper text, error messages.
- Use `react-hook-form` + `zod` for validation. Persist form state to `localStorage` (key: `kaptn-rbac-draft`).

## API Integration (backend is Go; you will call these)
- `GET /api/v1/namespaces` → `[{ name: "default" }, ...]`
- `GET /api/v1/api-resources` → Kubernetes discovery:
- `GET /api/v1/identities` -> known identities