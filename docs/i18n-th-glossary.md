# Thai (th) i18n glossary

Terminology reference for [messages/th.json](../messages/th.json). Use consistently across all namespaces.

## Core domain terms

| English | Thai | Usage |
|---------|------|-------|
| Tender | ประกวดราคา | User-facing UI |
| Procurement / tendering (formal) | การจัดซื้อจัดจ้าง | Admin or formal copy |
| Match / matching | จับคู่ | |
| Consortium | คอนเซอร์เชียม | Procurement context |
| Partnership | กลุ่มพันธมิตร | Regional network copy |
| Company profile | โปรไฟล์บริษัท | |
| Capabilities | ความสามารถ | Taxonomy / company skills |
| Competencies | สมรรถนะ | Gap analysis, team builder |
| Project (VO) | โครงการ | Virtual organization projects |
| Consulting team | ทีมที่ปรึกษา | VO context |
| CPV code | รหัส CPV | Keep acronym |
| Dashboard | แดชบอร์ด | |
| Verification | การยืนยันตัวตน / การตรวจสอบ | Identity vs data review |
| Approval | การอนุมัติ | |
| Directory | ไดเรกทอรีบริษัท | |
| Saved tenders | ประกวดราคาที่บันทึกไว้ | |
| Gap analysis | การวิเคราะห์ช่องว่าง | Missing team competencies |
| Opportunity | โอกาสทางธุรกิจ | Hero / marketing copy |

## UI patterns

| English | Thai |
|---------|------|
| Sign In | เข้าสู่ระบบ |
| Sign Up | สมัครสมาชิก |
| Sign Out | ออกจากระบบ |
| Get Started | เริ่มต้นใช้งาน |
| Continue | ดำเนินการต่อ |
| Cancel | ยกเลิก |
| Save | บันทึก |
| Submit | ส่ง |
| Loading… / …ing | …กำลัง… / …中 use …อยู่… |
| Optional | ไม่บังคับ |
| Required | จำเป็น |

## Thailand deployment overrides

| Context | English (en) | Thai (th) |
|---------|--------------|-----------|
| Regional marketing | East Midlands | ประเทศไทย / ภูมิภาี |
| Currency in labels | £ | ฿ |
| Phone placeholder | +44 … | +66 … |
| Company registry | Companies House | เลขทะเบียนนิติบุคคล / Companies House (UK admin only) |
| Tax / registration | — | เลขประจำตัวผู้เสียภาษี / เลขทะเบียนนิติบุคคล |

## Tone

- Formal but approachable B2B Thai
- Short labels for buttons and nav (2–5 words)
- Full sentences for errors and toasts; state what happened and next step
- Thai has no grammatical plural — ICU `one` and `other` branches use identical text

## Validation

```bash
npm run validate:locales
npm run validate:locales -- --progress th
```
