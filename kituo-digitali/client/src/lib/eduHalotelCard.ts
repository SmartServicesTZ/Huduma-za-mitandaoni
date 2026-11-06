export const EDU_CARD_WIDTH = 2881;
export const EDU_CARD_HEIGHT = 1801;

export type EduQrDetails = {
  name: string;
  college: string;
  course: string;
  regNo: string;
  validUntil: string;
};

export function formatEduDate(isoDate: string): string {
  if (!isoDate) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function makeEduQrPayload(details: EduQrDetails): string {
  return JSON.stringify({
    demo: true,
    name: details.name.trim(),
    college: details.college.trim(),
    course: details.course.trim(),
    regNo: details.regNo.trim(),
    validUntil: details.validUntil.trim(),
  });
}
