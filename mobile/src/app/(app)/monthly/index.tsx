import { monthOf, todayIn } from "@domain/dates";
import { Redirect } from "expo-router";

export default function MonthlyIndex() {
  return <Redirect href={`/monthly/${monthOf(todayIn())}`} />;
}
