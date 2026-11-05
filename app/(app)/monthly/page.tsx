import { redirect } from "next/navigation";

import { monthOf, todayIn } from "@/lib/domain/dates";

export default function MonthlyIndex() {
  redirect(`/monthly/${monthOf(todayIn())}`);
}
