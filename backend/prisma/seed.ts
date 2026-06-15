import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Очистка БД...");
  // Очищаем в правильном порядке (foreign keys)
  await prisma.attendance.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.scheduleEntry.deleteMany();
  await prisma.teacherSubject.deleteMany();
  // Сначала разорвём групповые связи у пользователей, потом удалим группы
  await prisma.user.updateMany({ data: { groupId: null } });
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();
  await prisma.subject.deleteMany();

  const passwordHash = await bcrypt.hash("123456", 10);

  console.log("📚 Предметы...");
  const subjects = await Promise.all(
    [
      "Математика",
      "Информатика",
      "Основы права",
      "Экономическая теория",
      "Бухгалтерский учёт",
      "Менеджмент",
      "Конституционное право",
      "Гражданское право",
      "Деловой английский",
      "Физическая культура",
    ].map((name) => prisma.subject.create({ data: { name } }))
  );

  const subj = (n: string) => subjects.find((s) => s.name === n)!;

  console.log("👤 Админ...");
  const admin = await prisma.user.create({
    data: {
      firstName: "Иван",
      lastName: "Петров",
      middleName: "Сергеевич",
      email: "admin@college.by",
      passwordHash,
      role: "admin",
    },
  });

  console.log("👨‍🏫 Преподаватель...");
  const teacher = await prisma.user.create({
    data: {
      firstName: "Анна",
      lastName: "Смирнова",
      middleName: "Викторовна",
      email: "teacher@college.by",
      passwordHash,
      role: "teacher",
    },
  });

  // Препод ведёт несколько предметов
  await Promise.all(
    [
      "Математика",
      "Экономическая теория",
      "Основы права",
      "Менеджмент",
    ].map((name) =>
      prisma.teacherSubject.create({
        data: { teacherId: teacher.id, subjectId: subj(name).id },
      })
    )
  );

  console.log("🏫 Группы...");
  // 3 группы в разных направлениях
  const groupBP21 = await prisma.group.create({
    data: { name: "БП-21", year: 2, homeroomTeacherId: teacher.id }, // Бизнес и право, 2 курс
  });
  const groupEP22 = await prisma.group.create({
    data: { name: "ЭП-22", year: 1 }, // Экономика и право, 1 курс
  });
  const groupUR21 = await prisma.group.create({
    data: { name: "ЮР-21", year: 2 }, // Юриспруденция, 2 курс
  });

  console.log("🎓 Студенты (по одному в каждой группе для проверки прав)...");
  const studentBP = await prisma.user.create({
    data: {
      firstName: "Алексей",
      lastName: "Морозов",
      middleName: "Игоревич",
      email: "student1@college.by",
      passwordHash,
      role: "student",
      groupId: groupBP21.id,
    },
  });
  const studentEP = await prisma.user.create({
    data: {
      firstName: "Мария",
      lastName: "Соколова",
      middleName: "Андреевна",
      email: "student2@college.by",
      passwordHash,
      role: "student",
      groupId: groupEP22.id,
    },
  });
  const studentUR = await prisma.user.create({
    data: {
      firstName: "Никита",
      lastName: "Волков",
      middleName: "Дмитриевич",
      email: "student3@college.by",
      passwordHash,
      role: "student",
      groupId: groupUR21.id,
    },
  });

  // Доп. одногруппники чтобы журналы не были пустыми
  console.log("👥 Доп. одногруппники...");
  const moreStudents = [
    { firstName: "Полина", lastName: "Лебедева", groupId: groupBP21.id, email: "lebedeva@college.by" },
    { firstName: "Артём", lastName: "Зайцев", groupId: groupBP21.id, email: "zaytsev@college.by" },
    { firstName: "Елизавета", lastName: "Орлова", groupId: groupEP22.id, email: "orlova@college.by" },
    { firstName: "Кирилл", lastName: "Новиков", groupId: groupEP22.id, email: "novikov@college.by" },
    { firstName: "София", lastName: "Богданова", groupId: groupUR21.id, email: "bogdanova@college.by" },
    { firstName: "Максим", lastName: "Романов", groupId: groupUR21.id, email: "romanov@college.by" },
  ];
  for (const s of moreStudents) {
    await prisma.user.create({
      data: { ...s, role: "student", passwordHash, middleName: null },
    });
  }

  console.log("📊 Оценки (10-балльная)...");
  const groups = [groupBP21, groupEP22, groupUR21];
  for (const g of groups) {
    const students = await prisma.user.findMany({ where: { groupId: g.id, role: "student" } });
    for (const subjName of ["Математика", "Экономическая теория", "Основы права"]) {
      const s = subj(subjName);
      const today = new Date();
      for (let d = 1; d <= 22; d += 3) {
        const date = new Date(today.getFullYear(), today.getMonth(), d);
        for (const st of students) {
          if (Math.random() < 0.6) {
            const v = Math.floor(Math.random() * 6) + 5; // 5..10 в основном
            await prisma.grade.create({
              data: {
                studentId: st.id,
                subjectId: s.id,
                groupId: g.id,
                teacherId: teacher.id,
                date,
                value: Math.random() < 0.1 ? -1 : v, // 10% — "Н"
              },
            });
          }
        }
      }
    }
  }

  console.log("✅ Зачёты...");
  for (const g of groups) {
    const students = await prisma.user.findMany({ where: { groupId: g.id, role: "student" } });
    for (const subjName of ["Менеджмент"]) {
      const s = subj(subjName);
      const date = new Date();
      for (const st of students) {
        await prisma.assessment.create({
          data: {
            studentId: st.id,
            subjectId: s.id,
            groupId: g.id,
            teacherId: teacher.id,
            date,
            passed: Math.random() > 0.2,
          },
        });
      }
    }
  }

  console.log("🗓 Расписание...");
  // Простое расписание для каждой группы: пн-пт, 4-5 пар
  const lessonPlan: Record<string, [number, string][]> = {
    [groupBP21.id]: [
      [1, "Математика"], [1, "Экономическая теория"], [1, "Основы права"], [1, "Деловой английский"],
      [2, "Математика"], [2, "Менеджмент"], [2, "Информатика"],
      [3, "Бухгалтерский учёт"], [3, "Экономическая теория"], [3, "Физическая культура"],
      [4, "Гражданское право"], [4, "Математика"], [4, "Менеджмент"],
      [5, "Конституционное право"], [5, "Деловой английский"], [5, "Информатика"],
    ],
    [groupEP22.id]: [
      [1, "Математика"], [1, "Информатика"], [1, "Деловой английский"],
      [2, "Экономическая теория"], [2, "Бухгалтерский учёт"],
      [3, "Менеджмент"], [3, "Основы права"], [3, "Физическая культура"],
      [4, "Математика"], [4, "Информатика"], [4, "Конституционное право"],
      [5, "Экономическая теория"], [5, "Деловой английский"],
    ],
    [groupUR21.id]: [
      [1, "Конституционное право"], [1, "Гражданское право"], [1, "Деловой английский"],
      [2, "Основы права"], [2, "Математика"],
      [3, "Конституционное право"], [3, "Информатика"], [3, "Физическая культура"],
      [4, "Гражданское право"], [4, "Менеджмент"],
      [5, "Деловой английский"], [5, "Конституционное право"], [5, "Гражданское право"],
    ],
  };

  for (const [groupId, items] of Object.entries(lessonPlan)) {
    const usedSlots = new Set<string>();
    for (const [day, subjName] of items) {
      let lesson = 1;
      while (usedSlots.has(`${day}-${lesson}`)) lesson++;
      usedSlots.add(`${day}-${lesson}`);
      await prisma.scheduleEntry.create({
        data: {
          groupId,
          subjectId: subj(subjName).id,
          teacherId: teacher.id,
          dayOfWeek: day,
          lessonNumber: lesson,
          room: String(100 + Math.floor(Math.random() * 30)),
        },
      });
    }
  }

  console.log("📍 Посещаемость (пара примеров)...");
  await prisma.attendance.create({
    data: {
      studentId: studentBP.id,
      subjectId: subj("Математика").id,
      groupId: groupBP21.id,
      date: new Date(),
      status: "absent",
    },
  });
  await prisma.attendance.create({
    data: {
      studentId: studentEP.id,
      subjectId: subj("Экономическая теория").id,
      groupId: groupEP22.id,
      date: new Date(),
      status: "late",
    },
  });

  console.log("\n✅ Готово!\n");
  console.log("Демо-доступы (пароль: 123456):");
  console.log("  Админ        — admin@college.by");
  console.log("  Преподаватель — teacher@college.by");
  console.log("  Студент БП-21 — student1@college.by  (Морозов)");
  console.log("  Студент ЭП-22 — student2@college.by  (Соколова)");
  console.log("  Студент ЮР-21 — student3@college.by  (Волков)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
