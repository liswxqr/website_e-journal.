import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Loader } from "@/components/ui/Loader";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import * as scheduleApi from "@/api/schedule";
import * as subjectsApi from "@/api/subjects";
import * as classesApi from "@/api/classes";
import * as usersApi from "@/api/users";
import type { ScheduleEntry, Subject, SchoolClass, User } from "@/types";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const TIMES = [
  "08:30",
  "09:25",
  "10:30",
  "11:25",
  "12:20",
  "13:25",
  "14:20",
  "15:15",
];
const MAX_LESSONS = 8;

interface EditingEntry {
  id?: string;
  groupId: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6;
  lessonNumber: number;
  room: string;
}

export default function SchedulePage() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [editing, setEditing] = useState<EditingEntry | null>(null);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = текущая неделя

  const canEdit = user?.role === "admin";

  // Даты понедельника..субботы выбранной недели
  const weekDates = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const daysSinceMonday = (base.getDay() + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - daysSinceMonday + weekOffset * 7);
    return DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [weekOffset]);

  const todayKey = new Date().toDateString();

  const reload = () =>
    Promise.all([
      scheduleApi.listSchedule(),
      subjectsApi.listSubjects(),
      classesApi.listClasses(),
      usersApi.listUsers("teacher"),
    ]).then(([sc, su, cl, te]) => {
      setSchedule(sc);
      setSubjects(su);
      setClasses(cl);
      setTeachers(te);
    });

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    reload().then(() => {
      if (user.role === "student" && user.groupId) setGroupFilter(user.groupId);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!groupFilter && classes.length && user?.role !== "student") {
      setGroupFilter(classes[0].id);
    }
  }, [classes, groupFilter, user]);

  const visible = useMemo(() => {
    let res = schedule;
    if (user?.role === "student" && user.groupId) {
      res = res.filter((s) => s.groupId === user.groupId);
    } else if (user?.role === "teacher") {
      res = res.filter((s) => s.teacherId === user.id);
    } else if (groupFilter) {
      res = res.filter((s) => s.groupId === groupFilter);
    }
    return res;
  }, [schedule, user, groupFilter]);

  if (loading) return <Loader />;

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const classMap = new Map(classes.map((c) => [c.id, c]));

  const maxLesson = canEdit ? MAX_LESSONS : Math.max(6, ...visible.map((s) => s.lessonNumber));

  function openNew(day: 1 | 2 | 3 | 4 | 5 | 6, lesson: number) {
    if (!canEdit || !groupFilter) return;
    setEditing({
      groupId: groupFilter,
      subjectId: subjects[0]?.id ?? "",
      teacherId: teachers[0]?.id ?? "",
      dayOfWeek: day,
      lessonNumber: lesson,
      room: "",
    });
  }

  function openEdit(entry: ScheduleEntry) {
    if (!canEdit) return;
    setEditing({
      id: entry.id,
      groupId: entry.groupId,
      subjectId: entry.subjectId,
      teacherId: entry.teacherId,
      dayOfWeek: entry.dayOfWeek,
      lessonNumber: entry.lessonNumber,
      room: entry.room ?? "",
    });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await scheduleApi.upsertScheduleEntry({
        id: editing.id,
        groupId: editing.groupId,
        subjectId: editing.subjectId,
        teacherId: editing.teacherId,
        dayOfWeek: editing.dayOfWeek,
        lessonNumber: editing.lessonNumber,
        room: editing.room || undefined,
      });
      await reload();
      setEditing(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing?.id) return;
    if (!confirm("Удалить занятие из расписания?")) return;
    setSaving(true);
    try {
      await scheduleApi.deleteScheduleEntry(editing.id);
      await reload();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Расписание</h1>
          <p>
            {user?.role === "student" && user.groupId
              ? `Группа ${classMap.get(user.groupId)?.name ?? ""}`
              : user?.role === "teacher"
              ? "Ваши занятия"
              : canEdit
              ? "Кликните по пустой клетке — добавить занятие. По заполненной — изменить или удалить."
              : "Расписание занятий"}
          </p>
        </div>

        {canEdit && (
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Select
              label="Группа"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
            />
            {saving && <span className="muted">Сохранение…</span>}
          </div>
        )}
      </div>

      {/* Навигация по неделям */}
      <div className="week-nav">
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
          ← Пред. неделя
        </Button>
        <div className="week-nav__label">
          {weekRangeLabel(weekDates)}
          {weekOffset !== 0 && (
            <button className="week-nav__today" onClick={() => setWeekOffset(0)}>
              Текущая неделя
            </button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
          След. неделя →
        </Button>
      </div>

      <div
        className="schedule"
        style={{ gridTemplateColumns: `90px repeat(${DAYS.length}, 1fr)` }}
      >
        <div className="schedule__head">№ / время</div>
        {DAYS.map((d, i) => {
          const date = weekDates[i];
          const isToday = date.toDateString() === todayKey;
          return (
            <div className={"schedule__head" + (isToday ? " schedule__head--today" : "")} key={d}>
              {d}
              <span className="schedule__head-date">{fmtDay(date)}</span>
              {isToday && <span className="schedule__today-badge">сегодня</span>}
            </div>
          );
        })}

        {Array.from({ length: maxLesson }).map((_, i) => {
          const lesson = i + 1;
          return (
            <Row
              key={lesson}
              lesson={lesson}
              time={TIMES[i] ?? ""}
              days={DAYS.length}
              schedule={visible}
              subjectMap={subjectMap}
              teacherMap={teacherMap}
              role={user?.role}
              canEdit={canEdit}
              onNew={openNew}
              onEdit={openEdit}
              weekDates={weekDates}
              todayKey={todayKey}
            />
          );
        })}
      </div>

      <Modal
        open={!!editing}
        title={editing?.id ? "Редактирование занятия" : "Новое занятие"}
        onClose={() => setEditing(null)}
        footer={
          <>
            {editing?.id && (
              <Button variant="danger" onClick={remove}>
                Удалить
              </Button>
            )}
            <div style={{ flex: 1 }} />
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Отмена
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </>
        }
      >
        {editing && (
          <>
            <div className="grid-2">
              <Select
                label="Группа"
                value={editing.groupId}
                onChange={(e) => setEditing({ ...editing, groupId: e.target.value })}
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
              />
              <Select
                label="День недели"
                value={String(editing.dayOfWeek)}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    dayOfWeek: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6,
                  })
                }
                options={DAYS.map((d, i) => ({ value: String(i + 1), label: d }))}
              />
            </div>

            <div className="grid-2">
              <Select
                label="№ пары"
                value={String(editing.lessonNumber)}
                onChange={(e) =>
                  setEditing({ ...editing, lessonNumber: Number(e.target.value) })
                }
                options={Array.from({ length: MAX_LESSONS }).map((_, i) => ({
                  value: String(i + 1),
                  label: `${i + 1} (${TIMES[i] ?? ""})`,
                }))}
              />
              <Input
                label="Кабинет"
                value={editing.room}
                onChange={(e) => setEditing({ ...editing, room: e.target.value })}
              />
            </div>

            <Select
              label="Предмет"
              value={editing.subjectId}
              onChange={(e) => setEditing({ ...editing, subjectId: e.target.value })}
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            />

            <Select
              label="Преподаватель"
              value={editing.teacherId}
              onChange={(e) => setEditing({ ...editing, teacherId: e.target.value })}
              options={teacherOptions(teachers, subjects, editing.subjectId)}
            />
          </>
        )}
      </Modal>
    </>
  );
}

// Преподаватели предмета — со звёздочкой в начале списка
function teacherOptions(teachers: User[], subjects: Subject[], subjectId: string) {
  const subj = subjects.find((s) => s.id === subjectId);
  if (!subj?.teacherIds.length) {
    return teachers.map((t) => ({ value: t.id, label: `${t.lastName} ${t.firstName}` }));
  }
  const preferred = teachers.filter((t) => subj.teacherIds.includes(t.id));
  const others = teachers.filter((t) => !subj.teacherIds.includes(t.id));
  return [
    ...preferred.map((t) => ({ value: t.id, label: `★ ${t.lastName} ${t.firstName}` })),
    ...others.map((t) => ({ value: t.id, label: `${t.lastName} ${t.firstName}` })),
  ];
}

function Row({
  lesson,
  time,
  days,
  schedule,
  subjectMap,
  teacherMap,
  role,
  canEdit,
  onNew,
  onEdit,
  weekDates,
  todayKey,
}: {
  lesson: number;
  time: string;
  days: number;
  schedule: ScheduleEntry[];
  subjectMap: Map<string, Subject>;
  teacherMap: Map<string, User>;
  role?: string;
  canEdit: boolean;
  onNew: (day: 1 | 2 | 3 | 4 | 5 | 6, lesson: number) => void;
  onEdit: (entry: ScheduleEntry) => void;
  weekDates: Date[];
  todayKey: string;
}) {
  return (
    <>
      <div className="schedule__time">
        <strong>{lesson}</strong>
        <br />
        {time}
      </div>
      {Array.from({ length: days }).map((_, i) => {
        const day = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
        const isToday = weekDates[i]?.toDateString() === todayKey;
        const item = schedule.find((s) => s.dayOfWeek === day && s.lessonNumber === lesson);
        if (!item) {
          return (
            <div
              key={day}
              className={
                "schedule__cell schedule__cell--empty" + (isToday ? " schedule__cell--today" : "")
              }
              style={canEdit ? { cursor: "pointer", display: "grid", placeItems: "center" } : undefined}
              onClick={canEdit ? () => onNew(day, lesson) : undefined}
              title={canEdit ? "Добавить занятие" : undefined}
            >
              {canEdit && (
                <span style={{ fontSize: 20, color: "var(--text-soft)", opacity: 0.5 }}>+</span>
              )}
            </div>
          );
        }
        const subject = subjectMap.get(item.subjectId);
        const teacher = teacherMap.get(item.teacherId);
        return (
          <div
            key={day}
            className={"schedule__cell" + (isToday ? " schedule__cell--today" : "")}
            style={canEdit ? { cursor: "pointer" } : undefined}
            onClick={canEdit ? () => onEdit(item) : undefined}
            title={canEdit ? "Изменить" : undefined}
          >
            <span className="schedule__subject">{subject?.name ?? "—"}</span>
            <span className="schedule__meta">
              {role !== "student" && teacher && <>{teacher.lastName} {teacher.firstName[0]}. · </>}
              каб. {item.room ?? "—"}
            </span>
          </div>
        );
      })}
    </>
  );
}

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekRangeLabel(dates: Date[]): string {
  const from = dates[0];
  const to = dates[dates.length - 1];
  if (from.getMonth() === to.getMonth()) {
    return `${from.getDate()}–${to.getDate()} ${MONTHS[to.getMonth()]} ${to.getFullYear()}`;
  }
  return `${from.getDate()} ${MONTHS[from.getMonth()]} — ${to.getDate()} ${MONTHS[to.getMonth()]} ${to.getFullYear()}`;
}
