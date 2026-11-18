# P6 Vehicle Contact — Frontend Reference Register

**Document ID:** P6VC-FE-REF-001

**Status:** CONTROLLED REFERENCE REGISTER

**Last verified:** 2026-11-18 (Asia/Bangkok)

## 1. Purpose

ทะเบียนนี้แยกมาตรฐานทางการ เอกสารผลิตภัณฑ์ และแนวปฏิบัติออกจากกัน เพื่อป้องกันการอ้างคำแนะนำเป็นข้อบังคับโดยไม่ถูกต้อง ทุกการนำ source ภายนอกมาใช้ต้องบันทึกสิ่งที่รับมา สิ่งที่ไม่รับมา และผลกระทบต่อโครงการ

Source ภายนอกไม่ supersede approved business rule, GAS permission contract, security/privacy decision หรือข้อกำหนดของ Project Owner

## 2. Source classification

| Class | Meaning | Project use |
|---|---|---|
| Normative standard | มาตรฐานที่มี conformance criteria | ใช้กำหนด acceptance target |
| Official product documentation | เอกสารจากผู้พัฒนา dependency | ใช้กำหนด API/version-compatible implementation |
| Informative practice | แนวปฏิบัติ/ตัวอย่างที่ไม่มี conformance model | ใช้เป็น pattern และต้องทดสอบกับบริบทจริง |
| Security verification standard | control catalog สำหรับออกแบบ/ทดสอบ | map เข้ากับ threat model และ test evidence |
| Project decision | การประยุกต์ที่อนุมัติสำหรับ P6VC | เป็นข้อบังคับภายใน repository |

## 3. Controlled references

| Ref | Source and classification | Adopted rule | Not adopted / caution | Review trigger |
|---|---|---|---|---|
| REF-VUE-01 | [Vue Composition API FAQ](https://vuejs.org/guide/extras/composition-api-faq.html) — official product docs | ใช้ Composition API/composables เพื่อจัด logic ตาม feature | ไม่ตีความว่า reactive logic ทั้งหมดต้องเป็น global composable | Vue major upgrade |
| REF-VUE-02 | [Vue Application API](https://vuejs.org/api/application.html) — official product docs | หลีกเลี่ยง application/global mixins; ใช้ composables | plugin/library internals อาจมี mixin แต่ต้องไม่รั่วเข้า application pattern | Vue major upgrade or plugin adoption |
| REF-VUE-03 | [Vue Provide/Inject](https://vuejs.org/guide/components/provide-inject.html) — official product docs | ใช้ Symbol keys สำหรับ stable injected service และวาง mutation ใกล้ provider | ไม่ใช้แทน props สำหรับ parent-child data ปกติ | DI contract change |
| REF-VUE-04 | [Vue TypeScript with Composition API](https://vuejs.org/guide/typescript/composition-api.html) — official product docs | typed props/events/slots เป็น target เมื่อ migration ไป TypeScript | โครงการปัจจุบันเป็น JavaScript; ห้ามอ้าง type safety ที่ยังไม่มี | TypeScript ADR/migration |
| REF-ROUTER-01 | [Vue Router Route Meta Fields](https://router.vuejs.org/guide/advanced/meta.html) และ [Navigation Guards](https://router.vuejs.org/guide/advanced/navigation-guards.html) — official product docs | route meta + global guard สำหรับ navigation UX | guard ไม่ใช่ backend authorization | Router major upgrade |
| REF-PINIA-01 | [Pinia Core Concepts](https://pinia.vuejs.org/core-concepts/) — official product docs | Setup stores แยก state/getters/actions และใช้ store เฉพาะ shared state | ไม่ย้าย local form/temporary page state เข้า global store | Pinia major upgrade |
| REF-DAISY-01 | [daisyUI Themes](https://daisyui.com/docs/themes/) — official product docs, verified 5.8.1 | enable all approved built-in themes, `data-theme` selection และ fallback | การมี 35 themes ไม่รับประกันว่า custom UI ของเราผ่าน accessibility | daisyUI upgrade/theme set change |
| REF-DAISY-02 | [daisyUI Semantic Colors](https://daisyui.com/docs/colors/) — official product docs | ใช้ `base-*`, `primary`, `secondary`, `accent`, semantic status colors | ห้ามสรุปว่า theme colors แก้ contrast/custom state ให้เองทั้งหมด | visual token change |
| REF-TAILWIND-01 | [Tailwind Theme Variables](https://tailwindcss.com/docs/theme) — official product docs | เก็บ reusable design decisions เป็น theme variables/tokens | arbitrary values ใช้เฉพาะ exception ที่ review แล้ว | Tailwind major upgrade |
| REF-WCAG-01 | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — W3C normative standard | เป้าหมาย WCAG 2.2 AA; map criteria เข้า checklist/tests | automated scan ไม่พิสูจน์ conformance ทั้งหมด | W3C recommendation change |
| REF-APG-01 | [WAI-ARIA APG Patterns](https://www.w3.org/WAI/ARIA/apg/patterns/) และ [Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) — W3C informative practice | ใช้ dialog, menu, toolbar, grid และ focus conventions เป็น pattern baseline | APG เป็น informative ไม่ใช่มาตรฐาน conformance; prefer native HTML/DaisyUI semantics ก่อน custom ARIA | custom interactive widget change |
| REF-OWASP-01 | [OWASP ASVS 5.0.0](https://asvs.owasp.org/) — security verification standard | map frontend threat model, session, browser/client protection และ verification evidence | ไม่อ้างว่า ASVS ผ่านจนมี requirement mapping/test evidence | ASVS stable release or security architecture change |
| REF-OWASP-02 | [OWASP Cheat Sheet Series ASVS Index](https://cheatsheetseries.owasp.org/IndexASVS.html) — informative security guidance | ใช้ค้น control-specific guidance เช่น CSP, session, validation, third-party JavaScript | cheat sheet ไม่แทน project threat model หรือ GAS authorization tests | new external script/security control |

## 4. Project adaptations derived from the references

| Decision | Source basis | P6VC adaptation |
|---|---|---|
| Composition over inheritance | REF-VUE-01/02 | slots + composables + adapters; prohibit mixins/extends |
| Template Method by slots | REF-VUE-01/03 | PageTemplate owns layout; pages fill named slots |
| Permission-driven route UX | REF-ROUTER-01 + backend contract | route meta/menu use permissions; GAS authorizes request |
| Minimal global state | REF-PINIA-01 | Pinia only for session/UI/shared cross-route feature state |
| Theme-independent UI | REF-DAISY-01/02 + REF-TAILWIND-01 | semantic tokens only; test all enabled themes |
| Keyboard/focus contracts | REF-WCAG-01 + REF-APG-01 | visible focus, focus order, dialog return focus and widget-specific keys |
| Security verification | REF-OWASP-01/02 | map threats/tests without storing secrets or treating client as authority |

## 5. Research and adoption protocol

1. Define the question and affected decision
2. Prefer normative or official primary source
3. Verify version and access date
4. Separate direct source fact from project inference
5. Compare alternatives when trade-offs exist
6. Record adopted and rejected aspects
7. Prototype and test in Thai content, required themes and viewports
8. Update architecture/ADR/checklist before calling the rule mandatory
9. Add automated enforcement where feasible

## 6. Maintenance

- Review this register on dependency major/minor upgrade that changes behavior, accessibility standard update, security baseline update or new complex widget
- Routine review at least once per quarter during active development
- Broken or redirected source links are a documentation defect
- A newer version does not automatically supersede the project baseline; assess migration and record the decision
- Preserve prior reference decisions in Git history rather than rewriting evidence without explanation

## 7. Known research gaps

- Thai public-sector plain-language/content design guidance specific to operational software
- validated Thai screen-reader and input-method behavior on target devices
- final iconography/license decision
- real field workflow observation for staff under time pressure
- organizational accessibility reviewer and acceptance process

These gaps are `OPEN` and MUST NOT be presented as completed research
