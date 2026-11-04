import { redirect } from "next/navigation";

/** 别名：很多人会先试 /settings */
export default function SettingsAliasPage() {
  redirect("/kb/settings");
}
