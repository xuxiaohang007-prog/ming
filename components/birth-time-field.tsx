import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { InputField } from "./input-field";
import { TIME_PATTERN, TIME_PERIODS, toTimeIndex } from "@/lib/birth-options";
import type { BirthTimeMode, FortuneFormData } from "@/lib/types";

type Props = {
  mode: BirthTimeMode;
  time: string;
  period: string;
  errors: FieldErrors<FortuneFormData>;
  register: UseFormRegister<FortuneFormData>;
  onModeChange: (mode: BirthTimeMode) => void;
};

export function BirthTimeField({ mode, time, period, errors, register, onModeChange }: Props) {
  const index = mode === "exact" && TIME_PATTERN.test(time) ? toTimeIndex(time) : mode === "period" && /^(?:[0-9]|1[0-2])$/.test(period) ? Number(period) : null;
  const selected = index === null ? null : TIME_PERIODS[index];
  return <fieldset className="birth-time-field">
    <legend>出生时间掌握程度</legend>
    <div className="calendar-options time-mode-options">
      {([['exact', '准确时间'], ['period', '只知时辰'], ['unknown', '时间未知']] as const).map(([value, label]) => <label key={value} className={`calendar-option ${mode === value ? "is-selected" : ""}`}><input type="radio" name="birthTimeMode" value={value} checked={mode === value} onChange={() => onModeChange(value)} />{label}</label>)}
    </div>
    {mode === "exact" && <InputField label="出生时间" type="time" step="60" hint="UTC+8 标准时间" error={errors.birthTime?.message} {...register("birthTime")} />}
    {mode === "period" && <InputField label="出生时辰" hint="早子与晚子分开选择" error={errors.birthTimePeriod?.message} options={[{ label: "请选择出生时辰", value: "" }, ...TIME_PERIODS.map((item) => ({ label: `${item.name} · ${item.start} 至 ${item.end}`, value: String(item.index) }))]} {...register("birthTimePeriod")} />}
    <div className="time-conversion-note" role="status">
      {mode === "unknown" ? "出生时间未知时，暂不能生成确定命盘。可先填写其他信息，待补充准确时间或时辰后继续。" : selected ? `对应${selected.name} · ${selected.start} 至 ${selected.end}${selected.index === 12 ? "。晚子归次日由排盘库处理，出生日期不会手动加一天。" : "。"}${mode === "period" ? "只保存时辰范围，不推定具体分钟。" : "原始时分将保留在档案中。"}` : "请选择或填写出生时间，系统会明确展示对应时辰，不使用默认时间。"}
    </div>
    {errors.birthTimeMode?.message && <p className="field-error-message" role="alert">{errors.birthTimeMode.message}</p>}
  </fieldset>;
}
