import type {RequestPriority, RequestStatus, UserRole} from './types.ts';

export const REQUEST_STATUSES: RequestStatus[] = [
  'جديد',
  'تم الإسناد',
  'قيد التنفيذ',
  'مكتمل',
  'ملغي',
];

export const REQUEST_PRIORITIES: RequestPriority[] = ['عادي', 'عالي', 'عاجل'];

export interface CleaningRequestTypeOption {
  value: string;
  label: string;
  isHighRisk: boolean;
}

export const CLEANING_REQUEST_TYPES: CleaningRequestTypeOption[] = [
  {value: 'تنظيف روتيني للغرفة', label: 'تنظيف روتيني للغرفة', isHighRisk: false},
  {value: 'تعقيم بعد خروج مريض', label: 'تعقيم وتطهير شامل للغرفة', isHighRisk: false},
  {value: 'تنظيف ممرات ومرافق', label: 'تنظيف ممرات أو مرافق عامة', isHighRisk: false},
  {value: 'جمع نفايات عادية', label: 'جمع وتفريغ النفايات العادية', isHighRisk: false},
  {value: 'إزالة نفايات طبية', label: 'إزالة نفايات طبية وفق المسار الآمن', isHighRisk: true},
  {value: 'تلوث بالدم أو سوائل الجسم', label: 'تلوث بالدم أو سوائل الجسم', isHighRisk: true},
  {value: 'تلوث عالي الخطورة / عزل', label: 'تلوث عالي الخطورة أو غرفة عزل', isHighRisk: true},
];

export const SHIFT_OPTIONS = [
  'الصباحية (07:00 - 15:00)',
  'المسائية (15:00 - 23:00)',
  'الليلية (23:00 - 07:00)',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مدير النظام',
  supervisor: 'مشرف خدمات النظافة',
  worker: 'عامل نظافة',
};

export const HIGH_RISK_KEYWORDS = [
  'دم',
  'سوائل',
  'قيء',
  'استفراغ',
  'بول',
  'براز',
  'إفرازات',
  'عدوى',
  'عزل',
  'تلوث',
  'بيولوجي',
  'blood',
  'fluid',
  'biohazard',
];

export function detectHighRisk(requestType: string, description: string, explicitHighRisk?: boolean): boolean {
  if (explicitHighRisk) return true;
  const matchedType = CLEANING_REQUEST_TYPES.find((t) => t.value === requestType);
  if (matchedType?.isHighRisk) return true;
  const lower = description.toLowerCase();
  return HIGH_RISK_KEYWORDS.some((kw) => lower.includes(kw));
}

export const PRIORITY_SLA_MINUTES: Record<RequestPriority, number> = {
  عاجل: 15,
  عالي: 30,
  عادي: 60,
};
