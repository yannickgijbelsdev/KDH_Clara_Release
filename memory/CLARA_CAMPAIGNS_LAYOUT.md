# Clara Campaigns Layout — applied on this project

Reference: user-supplied Clara Campaigns design brief (Feb 2026).

## Applied in this project
- Google Fonts (Outfit + Plus Jakarta Sans + JetBrains Mono) → 
- Body = Plus Jakarta Sans, headings/.font-display = Outfit
- Clara utility classes: .clara-soft / .clara-hover / .clara-trans
- Canvas = bg-[#F5F6F8]; sticky header bg-[#F5F6F8]/90 backdrop-blur-xl, h-16, max-w-[1400px] mx-auto px-6
- Logo lockup = mark + 1px slate divider + Outfit wordmark
- Workspace pill = border-slate-200, Globe icon, chevron
- Pill nav = LEFT-aligned (ml-3 flex-1), animated dark pill via Framer layoutId=pill-active, inactive text-slate-500, hover text-slate-900
- PrimaryButton (/app/frontend/src/components/clara/PrimaryButton.jsx) = solid rose-600 pill, Framer hover/press
- SecondaryButton = outline slate pill

## Not applied (deliberately, out of scope)
- Rewriting every page body — only the shell was swapped. Individual pages (RDS, Shows, Content...) keep their current layout to avoid regressions; they inherit the new typography + canvas automatically.
- Clara Campaigns-specific banner / list-row / segmented tab snippets stay available in the spec for selective adoption.
