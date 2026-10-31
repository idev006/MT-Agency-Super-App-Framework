# MT Vehicle Contact — Team Upskill / Reskill Research
**Research date:** 31 ตุลาคม 2569 | **Status:** knowledge baseline, not legal certification

## 1. วัตถุประสงค์
พัฒนาองค์ความรู้ของบทบาทที่ใช้ทบทวน MT Vehicle Contact โดยใช้แหล่งต้นทางที่น่าเชื่อถือ แล้วแปลงความรู้เป็นข้อกำหนดที่นำไปใช้กับโครงการได้จริง ยึด **Simple is the Best / Policy → Actors → Use Cases → Workflow → System** และ **No verified legal basis → no production personal-data collection**.

## 2. หลักสูตรและแหล่งต้นทางที่ตรวจพบ
| Track / บทบาท | เอกสารต้นทาง | ความรู้ที่ใช้กับโครงการ | หลักฐานผลงานต่อไป |
|---|---|---|---|
| นักเขียนโครงการราชการ / Project lead | สศช. คู่มือการจัดทำโครงการของหน่วยงานรัฐเพื่อตอบโจทย์ประเทศ https://www.nesdc.go.th/en/nscr/project/ | โครงการต้องโยงปัญหาจริงกับผลผลิต ผลลัพธ์ ตัวชี้วัด กิจกรรมและทรัพยากร | QC project proposal: problem–objective–output–outcome–KPI trace |
| นิติกรอาวุโส / DPO / Privacy analyst | สคส. GPPC Plus https://register-gppc-plus.pdpc.or.th/ และ GPPC ภาครัฐ https://gppc.pdpc.or.th/ | ROPA ตาม ม.39 เป็นบันทึกกิจกรรม; ต้องตรวจฐานกฎหมายและประกาศที่ใช้บังคับเป็นรายกิจกรรม | Legal register + decision records + approved ROPA and privacy notices |
| UX / Business Analyst / Operations | สศช. หลักการออกแบบกิจกรรมและความจำเป็น https://www.nesdc.go.th/wordpress/wp-content/uploads/2025/11/PPT-PDPC-061168.pdf | คัดเฉพาะขั้นตอนจำเป็นและไม่สร้างคอขวด | Gate SOP: มี QR / ไม่มี QR; parking incident; fallback |
| Security engineer / Developer / QA | OWASP ASVS 5.0.0 https://asvs.owasp.org/ | ความปลอดภัยเป็น requirement ที่ทดสอบได้: authentication, authorization, API, data protection, logging | Security acceptance test for token, plate search, API and permissions |
| Security governance | NIST CSF 2.0 ฉบับภาษาไทย https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20-thai-translation | กำกับความเสี่ยง ระบุ ป้องกัน ตรวจจับ ตอบสนอง ฟื้นฟู | risk register and accountable owners |
| Privacy engineering | NIST Privacy Framework https://www.nist.gov/privacy-framework | วิเคราะห์ความเสี่ยงต่อบุคคลโดยไม่ถือว่าเป็นกฎหมายไทย | privacy risk assessment and data-minimization review |
| Digital law reviewer | ETDA พ.ร.บ.ธุรกรรมทางอิเล็กทรอนิกส์ (ฉบับที่ 3) พ.ศ. 2562 https://www.etda.or.th/th/Useful-Resource/กฎหมาย-HTML/พระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์/พระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์-(ฉบับที่-3)-พ-ศ-2562.aspx | ประเมินเอกสารอิเล็กทรอนิกส์และฐานกฎหมายที่เกี่ยวข้องจริง | digital-law applicability checklist |

## 3. บทเรียนที่นำไปใช้ทันที
1. **โครงการมาก่อนระบบ:** เขียนเหตุผลความจำเป็นและเกณฑ์สำเร็จที่ตรวจสอบได้ก่อนเพิ่มหน้าจอ
2. **ROPA ตามกิจกรรมจริง:** การลงทะเบียนรถประจำ การลงทะเบียนผู้มาติดต่อ การออก QR การค้นข้อมูล การติดตามการไม่ปฏิบัติตาม และ logging มีเจ้าของ/วัตถุประสงค์/ระยะเก็บต่างกัน
3. **ไม่ใช้ความยินยอมแทนฐานกฎหมายโดยอัตโนมัติ:** หน่วยงานต้องบันทึกอำนาจหน้าที่และฐานกฎหมายที่เหมาะสม; ต้องให้ผู้มีอำนาจตรวจจริง
4. **Authorization ฝั่งบริการ:** สแกน QR แล้วไม่ควรเห็นเบอร์โทรเมื่อไม่ได้รับสิทธิ์ และค้นทะเบียนจำนวนมากต้องถูกจำกัดและบันทึกเหตุ
5. **การปฏิบัติจริงต้องเร็ว:** รปภ. ตรวจรถมี QR ตามหลักเกณฑ์ รถไม่มี QR ลงทะเบียนที่จุดเข้า เมื่อพบรถกีดขวางให้สแกนหรือค้นทะเบียน พร้อมช่องทาง fallback
6. **Privacy and security by design:** ลดข้อมูล ระบุอายุเก็บ ตรวจบทบาทผู้ควบคุมข้อมูล/ผู้ประมวลผล รวมถึงบริการคลาวด์

## 4. เกณฑ์ QC จากบทบาททีม
| reviewer | Questions to sign off | status |
|---|---|---|
| Executive Policy | มีผลลัพธ์เดียวที่นำไปตัดสินใจได้หรือไม่ | Draft pass |
| Government project writer | ปัญหา กิจกรรม outputs outcomes KPI และงบประมาณเชื่อมกันหรือไม่ | Draft pass |
| Senior Thai legal counsel | มี authority, legal basis, latest amendments/subordinate rules verified หรือไม่ | **Pending real counsel** |
| DPO | ROPA notice retention rights incident response ครบและรับรองหรือไม่ | **Pending real DPO** |
| Security/IT | ไม่มี anonymous disclosure, tested authorization and storage security หรือไม่ | **Pending technical test** |
| Operations and QA | Gate workflows ทำได้จริงในช่วงรถหนาแน่นหรือไม่ | **Pending field pilot** |

## 5. Learning backlog สำหรับรอบตรวจสอบต่อไป
- ตรวจตัวบท PDPA ที่มีผลจริงถึงวันเริ่มใช้งาน พร้อมแก้ไขเพิ่มเติม และประกาศคณะกรรมการ/สคส. โดยจัดทำ source register ต่อมาตรา/ประกาศ
- อ้างอิงคำสั่งหรือระเบียบให้สิทธิในการตรวจรถ/เก็บข้อมูลที่สถานที่ราชการแห่งนี้ **อย่างเจาะจง** ไม่อนุมานจากหน้าที่ทั่วไป
- ทวนสอบมาตรการ security notice, breach notification, ROPA exemption, DPO applicability และ cross-border/cloud
- ทดสอบ threat model สำหรับ QR cloning, enumeration, unauthorized lookup, lost officer phone
- สำรวจเกณฑ์การเข้าออกจริงกับ รปภ. และทดสอบ sticker legibility/UV
- กำหนด baseline KPI และต้นทุนจากข้อมูลจริงก่อนเสนอเงินและกำหนดวันส่งมอบ

**Caveat:** เอกสารนี้รวบรวมการศึกษาแหล่งสาธารณะและข้อคิดนำไปใช้ ไม่ใช่หลักฐานว่ามีทีมบุคคลไปฝึกอบรม หรือสอบผ่านมาตรฐาน รวมถึงไม่ได้พิสูจน์ว่าตรวจประกาศ/กฎหมายไทยครบทุกฉบับ ณ วันที่จัดทำ.
