# Alrescha component state matrix

**Status:** F1 implementation contract

Every interactive component implements applicable states below. `—` means the state belongs to the containing region, not the component.

## 1. Shared state rules

| State          | Visual rule                                                    | Semantic/behavior rule                                                         |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Default        | Neutral surface, 1px semantic border, default foreground       | Native element/role and accessible name                                        |
| Hover          | `--bg-hover` or foreground change; 120ms color transition      | Enhancement only; never sole path                                              |
| Focus-visible  | 2px `--focus-ring`, 2px offset, never covered by sticky UI     | Keyboard only; preserve natural tab order                                      |
| Active/pressed | Emphasis background/border; no scale transform                 | `aria-pressed` only for toggles                                                |
| Selected       | `--bg-selected` plus accent indicator and text/icon cue        | `aria-current`, `aria-selected`, or checked state as appropriate               |
| Disabled       | Muted noninteractive state                                     | Native `disabled` only when no useful action/reason exists                     |
| Inactive       | AA-readable default geometry                                   | `aria-disabled="true"`; activation explains unavailable reason                 |
| Loading        | Label and dimensions remain stable; one local spinner          | Specific announcement; prevent duplicate activation without losing focus       |
| Empty          | Short reason, next action, no decorative illustration required | Region stays in document structure                                             |
| Error          | Danger border/icon plus plain recovery text                    | Region-level alert; preserve prior data and move focus only when action failed |

## 2. Component matrix

| Component       | Default                    | Hover                      | Focus-visible              | Active          | Selected                       | Disabled/inactive                   | Loading                          | Empty                           | Error                                |
| --------------- | -------------------------- | -------------------------- | -------------------------- | --------------- | ------------------------------ | ----------------------------------- | -------------------------------- | ------------------------------- | ------------------------------------ |
| Primary button  | Accent fill, 40/32px high  | Darken/lighten one step    | Outer 2px ring             | Emphasis fill   | —                              | Muted or AA inactive + reason       | Spinner replaces leading visual  | —                               | Action remains; inline reason        |
| Default button  | Subtle fill + border       | Hover fill                 | Outer 2px ring             | Stronger border | Pressed fill + `aria-pressed`  | Same as primary                     | Preserve label                   | —                               | Same as default + error message      |
| Icon button     | 32px square, tooltip       | Hover fill                 | Outer 2px ring             | Emphasis fill   | Accent indicator               | Accessible inactive reason          | Spinner keeps 32px box           | —                               | Danger icon only with text elsewhere |
| Link            | Accent text, underline opt | Underline                  | Ring/underline             | Darker accent   | `aria-current` + weight        | Render text, not fake disabled link | Local pending mark if navigation | —                               | Keep destination/retry text          |
| Input/select    | Default border             | Strong border              | Accent border + ring       | —               | Value text                     | Native disabled only when required  | Keep label; inline progress      | Placeholder never acts as label | Danger border + nearby message       |
| Repo tab/nav    | Neutral text/icon          | Hover fill                 | Inner/outer visible ring   | Emphasis fill   | 2px underline + `aria-current` | Omit impossible destination         | Keep current page visible        | —                               | Error belongs to page region         |
| List/table row  | Border-separated row       | Hover fill                 | Row ring/inset             | Emphasis fill   | Selected fill + side marker    | Muted data stays readable           | Skeleton rows preserve columns   | One spanning blank-state row    | Inline retry row                     |
| Status badge    | Text + icon + border       | No change unless clickable | Ring only if interactive   | —               | —                              | Never reduce evidence label         | `Checking` text + subtle spinner | `Unknown` explicit label        | `Failed` text + danger/broken style  |
| Graph node      | Type fill + label          | Local halo, tooltip        | Dedicated outer focus ring | —               | Two-ring Evidence trace        | —                                   | Skeleton/settling message        | Graph blank state               | Failed ring and textual inspector    |
| Graph edge      | Grade stroke + direction   | Path emphasis              | Via focused node/table row | —               | Trace stroke + arrow           | —                                   | Layout status, no edge pulsing   | Relationship summary            | Broken/dotted + text label           |
| Inspector/panel | Bordered layout column     | —                          | Controls use normal rings  | —               | Active tab underline           | Hidden panel leaves tab order       | Local skeleton, fixed width      | Selection guidance              | Local banner; graph remains usable   |
| Popover/dialog  | Overlay surface + shadow   | —                          | Trapped only in modal      | —               | —                              | —                                   | Preserve close/cancel behavior   | —                               | Error inside, focus first recovery   |

## 3. Graph keyboard contract

| Action                      | Keyboard result                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Enter graph/list            | Focus selected node if present; otherwise first visible node/row                    |
| Arrow keys                  | Move among deterministic adjacent/visible nodes; never pan focus out of view        |
| Enter or Space              | Select node and update inspector without stealing focus                             |
| Escape                      | Close force popover or inspector sub-overlay; next Escape clears selection          |
| `L` or explicit view toggle | Switch graph/list while preserving selection; shortcut works only when not typing   |
| Fit/reset button            | Reframe current filtered set and announce completion                                |
| Drag alternative            | Directional move controls available where manual placement is a real product action |

## 4. Verification hooks

- Shared primitives expose stable state attributes: `data-state`, `aria-current`, `aria-selected`, `aria-pressed`, `aria-busy`.
- Screenshot cases cover default, hover, focus-visible, selected, loading, empty, and error in both themes.
- Unit tests cover class/attribute contracts; Playwright covers keyboard, focus return, theme geometry, and no-obscured-focus behavior.
- Canvas pixels remain supplementary. The adjacency table carries complete accessible relationship data.
