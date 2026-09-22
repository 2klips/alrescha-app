# symbol-heritage

A fixture for the symbol layer (Phase 4 Wave F todo 26): exported classes and
interfaces that extend one another across a barrel, a namespace import and a
local declaration, plus a Python package whose classes extend through a `from`
import. `src/base.ts` declares the bases; `src/derived.ts` extends them.
