# Frontend design system

The visual source is the owner's `Desktop/Portfolio` project, reviewed during the 2026-09-04 foundation work.
RecursiveResearch adopts its restrained paper-and-terminal language while using an application workspace layout.
The frontend stylesheet is the implementation authority for token values.

## Palette

| Token         | Value     | Use                                |
| ------------- | --------- | ---------------------------------- |
| Paper         | `#f5f4ef` | Main canvas                        |
| Panel         | `#fbfaf6` | Cards, panels, inputs              |
| Ink           | `#1d2721` | Primary text and window title bars |
| Muted         | `#687169` | Supporting text                    |
| Line          | `#cfd3cc` | Rules and borders                  |
| Terminal      | `#286148` | Primary green actions and emphasis |
| Terminal soft | `#dbe5dc` | Selection and soft green surfaces  |
| Amber         | `#b5602d` | Focus and caution accents          |

Use semantic CSS custom properties, not repeated literals in components.
Add new tokens only when an existing role is insufficient.

## Typography, surfaces, and motion

- Body copy uses an Inter/system sans-serif stack.
- Headings and compact labels use `SFMono-Regular`, `Consolas`, `Liberation Mono`, `Courier New`, then monospace.
- Panels use square corners, one-pixel borders, ink title bars, and small hard offset shadows with a soft green tint.
- A subtle 24px ruled-paper background may provide texture.
- Keep layouts compact with deliberate whitespace and a clear content hierarchy.
- Use brief transitions around 140ms and small hover lifts where meaningful.
- Respect `prefers-reduced-motion`; the interface must remain usable without animation.
- Use amber focus-visible outlines with sufficient contrast and spacing.

Avoid rounded pills, rounded card grids, glossy gradients, large decorative shapes, and motion that competes with reading.
Do not use color alone for status; pair it with text and, where useful, a familiar icon.

## Application patterns

The persistent left sidebar contains the project list and nested chats, followed by configuration access.
Keep project selection, chat selection, and primary actions visually distinct.
Long names and paths must truncate or wrap deliberately without pushing controls out of view.

The workspace presents saved briefs and space for future activity and files.
Empty states explain the current action and should not resemble a completed research run.
Buttons should name the action, and disabled execution should explain that the harness is not implemented.

Configuration uses labeled sections for the Codex connection and harness defaults.
Account, loading, disconnected, unavailable, and error states must be explicit.
Never present missing usage as zero or a missing provider as a connected account.
Separate a form's unsaved draft from persisted configuration.

## Component and accessibility conventions

- Reuse buttons, form fields, section headers, empty states, and status treatments.
- Prefer semantic elements and native keyboard behavior over clickable generic containers.
- Label inputs and icon-only controls for assistive technology.
- Show validation close to the field and preserve entered values after a recoverable failure.
- Dialogs need a name, sensible initial focus, Escape behavior, and focus restoration.
- Keep all actions reachable on narrow screens and do not hide required navigation.
- Inspect desktop, narrow layouts, keyboard interaction, loading/error states, and reduced motion when changing a shared component.

Product copy should explain research work, not expose adapter protocols or internal package names.
