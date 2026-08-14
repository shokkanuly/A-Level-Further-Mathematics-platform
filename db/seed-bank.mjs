// Демонстрационный банк: по задаче на каждый вид и на каждую программу.
//
// Задачи здесь нужны не ради объёма, а ради того, чтобы каждый фильтр
// витрины имел хотя бы одно попадание: пустой фильтр невозможно отличить
// от сломанного, и первый же вопрос «а он вообще работает?» стоит часа.
//
// Условия — на английском (§12), это язык экзамена. Разборы — на русском.
// Формулировки пунктов спецификаций свои: тексты Pearson, Cambridge
// и College Board не копируются (§2).

const R = String.raw;

/**
 * @param {string} authorId
 * @returns {object[]} спецификации для createItem()
 */
export function bankItems(authorId) {
  return [
    // ═══ A-Level Further Maths · экзаменационная ════════════════════════════
    // Задача Stage 1. Структуру трогать нельзя: на неё опираются
    // demo:walkthrough (ждёт 4 из 8) и demo:regrade.
    {
      authorId,
      slug: "cp1-matrix-transformations-of-the-plane",
      kind: "exam",
      difficulty: 2,
      concepts: ["matrix-transformations", "matrix-multiplication"],
      // \vect — макрос комиссии, а не жирный шрифт руками (§3.3).
      stem: R`A transformation $T$ of the plane is represented by the matrix
$$\vect{M} = \begin{pmatrix} 0 & -1 \\ 1 & 0 \end{pmatrix}.$$`,
      parts: [
        {
          path: "a",
          label: "a",
          text: R`Describe fully the transformation $T$.`,
          answer_type: "mcq",
          marks: 2,
          answer_spec: {
            options: [
              { id: "o1", text_md: R`Rotation through $90^\circ$ anticlockwise about the origin` },
              { id: "o2", text_md: R`Rotation through $90^\circ$ clockwise about the origin` },
              { id: "o3", text_md: R`Reflection in the line $y = x$` },
              { id: "o4", text_md: R`Enlargement with scale factor $-1$, centre the origin` },
            ],
            correct: ["o1"],
            common_errors: [{ selected: ["o2"], feedback_code: "MCQ_ROTATION_DIRECTION" }],
          },
          steps: [
            {
              code: "M1",
              marks: 1,
              en: R`Consider the images of the base vectors: $\begin{pmatrix}1\\0\end{pmatrix} \mapsto \begin{pmatrix}0\\1\end{pmatrix}$ and $\begin{pmatrix}0\\1\end{pmatrix} \mapsto \begin{pmatrix}-1\\0\end{pmatrix}$.`,
              ru: R`Смотрим на образы базисных векторов: $\begin{pmatrix}1\\0\end{pmatrix} \mapsto \begin{pmatrix}0\\1\end{pmatrix}$ и $\begin{pmatrix}0\\1\end{pmatrix} \mapsto \begin{pmatrix}-1\\0\end{pmatrix}$.`,
            },
            {
              code: "A1",
              marks: 1,
              en: R`Rotation through $90^\circ$ anticlockwise about the origin.`,
              ru: R`Поворот на $90^\circ$ против часовой стрелки вокруг начала координат.`,
            },
          ],
        },
        {
          path: "b",
          label: "b",
          text: R`The transformation $T$ is applied twice.`,
          children: [
            {
              path: "b.i",
              label: "i",
              text: R`Find $\vect{M}^2$.`,
              answer_type: "matrix",
              marks: 2,
              answer_spec: { rows: 2, cols: 2, cells: ["-1", "0", "0", "-1"], mode: "exact" },
              steps: [
                {
                  code: "M1",
                  marks: 1,
                  en: R`$\vect{M}^2 = \begin{pmatrix}0&-1\\1&0\end{pmatrix}\begin{pmatrix}0&-1\\1&0\end{pmatrix}$`,
                },
                {
                  code: "A1",
                  marks: 1,
                  en: R`$= \begin{pmatrix}-1&0\\0&-1\end{pmatrix}$`,
                },
              ],
            },
            {
              path: "b.ii",
              label: "ii",
              text: R`Describe fully the single transformation represented by $\vect{M}^2$.`,
              answer_type: "mcq",
              marks: 1,
              answer_spec: {
                options: [
                  { id: "p1", text_md: R`Rotation through $180^\circ$ about the origin` },
                  { id: "p2", text_md: R`Reflection in the $x$-axis` },
                  { id: "p3", text_md: R`Rotation through $360^\circ$ about the origin` },
                  { id: "p4", text_md: R`Enlargement with scale factor $2$, centre the origin` },
                ],
                correct: ["p1"],
              },
              steps: [
                {
                  code: "A1",
                  marks: 1,
                  en: R`Rotation through $180^\circ$ about the origin.`,
                  ru: R`Поворот на $180^\circ$ вокруг начала координат.`,
                },
              ],
            },
          ],
        },
        {
          path: "c",
          label: "c",
          text: R`The matrix $\vect{N}$ represents a reflection in the line $y = x$. Write down $\vect{N}$.`,
          answer_type: "matrix",
          marks: 1,
          answer_spec: { rows: 2, cols: 2, cells: ["0", "1", "1", "0"], mode: "exact" },
          steps: [
            { code: "B1", marks: 1, en: R`$\vect{N} = \begin{pmatrix}0&1\\1&0\end{pmatrix}$` },
          ],
        },
        {
          path: "d",
          label: "d",
          text: R`Find the single matrix that represents $T$ followed by the reflection represented by $\vect{N}$, and hence describe that single transformation.`,
          answer_type: "matrix",
          marks: 2,
          answer_spec: {
            rows: 2,
            cols: 2,
            cells: ["1", "0", "0", "-1"],
            mode: "exact",
            // Классическая ошибка: посчитать MN вместо NM. Не «неверно»,
            // а именованный диагноз — ради этого feedback_code и существует.
            common_errors: [
              { cells: ["-1", "0", "0", "1"], feedback_code: "MATRIX_ORDER_SWAPPED" },
            ],
          },
          steps: [
            {
              code: "M1",
              marks: 1,
              en: R`Order matters. «$T$ followed by $\vect{N}$» is the product $\vect{NM}$, not $\vect{MN}$.`,
              ru: R`Порядок важен. «Сначала $T$, потом $\vect{N}$» — это произведение $\vect{NM}$, а не $\vect{MN}$.`,
            },
            {
              code: "A1",
              marks: 1,
              en: R`$\vect{NM} = \begin{pmatrix}1&0\\0&-1\end{pmatrix}$, a reflection in the $x$-axis.`,
              ru: R`$\vect{NM} = \begin{pmatrix}1&0\\0&-1\end{pmatrix}$ — отражение относительно оси $x$.`,
            },
          ],
        },
      ],
    },

    // ═══ SAT · практикум ════════════════════════════════════════════════════
    // Практикум ведёт по шагам: части (a) и (b) — не «вопросы», а контрольные
    // точки метода. Именно поэтому вид требует разбора: без него остаётся
    // тренажёр устного счёта.
    {
      authorId,
      slug: "sat-linear-equation-in-one-variable",
      kind: "practicum",
      difficulty: 1,
      concepts: ["linear-equations"],
      stem: R`Solve the equation
$$3(2x - 5) + 4 = x + 13.$$`,
      explanation: R`Линейное уравнение решается в одном и том же порядке, и порядок важнее ловкости.

**Шаг 1. Раскрыть скобки.** Слева $3(2x-5) + 4 = 6x - 15 + 4 = 6x - 11$.
Ошибка на этом шаге почти всегда одна: умножают на $3$ только первое слагаемое
в скобке. Множитель относится к скобке целиком.

**Шаг 2. Собрать $x$ в одной части, числа — в другой.** Из $6x - 11 = x + 13$
вычитаем $x$ и прибавляем $11$: $5x = 24$.

**Шаг 3. Разделить на коэффициент.** $x = \dfrac{24}{5} = 4.8$.

**Проверка — это часть решения, а не необязательный ритуал.**
Слева: $3(2\cdot 4.8 - 5) + 4 = 3(4.6) + 4 = 17.8$. Справа: $4.8 + 13 = 17.8$. Сошлось.

На SAT ответ вводится в поле, и $24/5$ засчитывается наравне с $4.8$.`,
      parts: [
        {
          path: "a",
          label: "a",
          text: R`Expand the left-hand side and collect like terms. What is the coefficient of $x$?`,
          answer_type: "numeric",
          marks: 1,
          answer_spec: { value: 6, tolerance: 0 },
          steps: [
            {
              code: "B1",
              marks: 1,
              en: R`$3(2x-5) + 4 = 6x - 15 + 4 = 6x - 11$, so the coefficient of $x$ is $6$.`,
              ru: R`$3(2x-5) + 4 = 6x - 15 + 4 = 6x - 11$, коэффициент при $x$ равен $6$.`,
            },
          ],
        },
        {
          path: "b",
          label: "b",
          text: R`After collecting like terms, what is the constant term on the left-hand side?`,
          answer_type: "numeric",
          marks: 1,
          answer_spec: { value: -11, tolerance: 0 },
          steps: [
            {
              code: "B1",
              marks: 1,
              en: R`$-15 + 4 = -11$.`,
              ru: R`$-15 + 4 = -11$. Знак минус теряется чаще всего именно здесь.`,
            },
          ],
        },
        {
          path: "c",
          label: "c",
          text: R`Solve the equation. Give the value of $x$.`,
          answer_type: "numeric",
          marks: 2,
          answer_spec: { value: 4.8, tolerance: 0.001 },
          steps: [
            {
              code: "M1",
              marks: 1,
              en: R`$6x - 11 = x + 13 \Rightarrow 5x = 24$`,
              ru: R`$6x - 11 = x + 13 \Rightarrow 5x = 24$`,
            },
            {
              code: "A1",
              marks: 1,
              en: R`$x = \dfrac{24}{5} = 4.8$`,
              ru: R`$x = \dfrac{24}{5} = 4.8$`,
            },
          ],
        },
      ],
    },

    // ═══ Школьная математика · теория ═══════════════════════════════════════
    // Теория проверяет не вычисление, а смысл. Разбор обязателен: без него
    // ученик запоминает, что «$D>0$ — два корня», и не знает почему.
    {
      authorId,
      slug: "school-quadratic-discriminant",
      kind: "theory",
      difficulty: 2,
      concepts: ["quadratics"],
      stem: R`For the quadratic equation $ax^2 + bx + c = 0$ with $a \neq 0$, the discriminant is
$$D = b^2 - 4ac.$$`,
      explanation: R`Дискриминант — не «формула для корней», а **одно число, которое отвечает
на вопрос о количестве корней до того, как корни найдены**.

Откуда он берётся. Выделим полный квадрат в $ax^2+bx+c=0$:
$$a\left(x + \frac{b}{2a}\right)^2 = \frac{b^2-4ac}{4a}.$$
Слева стоит квадрат, умноженный на $a$. Уравнение разрешимо в вещественных
числах ровно тогда, когда правая часть и $a$ одного знака — то есть когда
$b^2 - 4ac \geq 0$. Всё остальное — следствие:

- $D > 0$ — правая часть строго того же знака, квадрат равен положительному числу, **два различных корня**;
- $D = 0$ — квадрат равен нулю, значит скобка равна нулю, **один корень кратности 2**;
- $D < 0$ — квадрат вещественного числа не бывает отрицательным, **вещественных корней нет**.

**Чем это полезно на практике.** График $y = ax^2+bx+c$ пересекает ось $x$
столько раз, каково число корней. Поэтому вопрос «сколько точек пересечения
у параболы с осью абсцисс» и вопрос «каков знак $D$» — это один вопрос.

**Куда это ведёт дальше.** При $D<0$ корни существуют, но в комплексных
числах: $x = \dfrac{-b \pm i\sqrt{|D|}}{2a}$. Отсюда начинается тема
комплексных чисел в A-Level Further Maths — «корней нет» на самом деле
означает «корней нет среди вещественных».`,
      parts: [
        {
          path: "a",
          label: "a",
          text: R`The equation has $D > 0$. How many distinct real roots does it have?`,
          answer_type: "mcq",
          marks: 2,
          answer_spec: {
            options: [
              { id: "d1", text_md: R`Two distinct real roots` },
              { id: "d2", text_md: R`Exactly one real root` },
              { id: "d3", text_md: R`No real roots` },
              { id: "d4", text_md: R`It depends on the sign of $a$` },
            ],
            correct: ["d1"],
          },
          steps: [
            {
              code: "M1",
              marks: 1,
              en: R`$D>0$ means $\sqrt{D}$ is a positive real number, so $\pm\sqrt{D}$ gives two different values.`,
              ru: R`$D>0$ значит, что $\sqrt{D}$ — положительное вещественное число, и $\pm\sqrt{D}$ даёт два разных значения.`,
            },
            {
              code: "A1",
              marks: 1,
              en: R`Two distinct real roots.`,
              ru: R`Два различных вещественных корня. Знак $a$ на их количество не влияет — только на направление ветвей.`,
            },
          ],
        },
        {
          path: "b",
          label: "b",
          text: R`Find the discriminant of $x^2 - 6x + 9 = 0$.`,
          answer_type: "numeric",
          marks: 1,
          answer_spec: { value: 0, tolerance: 0 },
          steps: [
            {
              code: "B1",
              marks: 1,
              en: R`$D = (-6)^2 - 4(1)(9) = 36 - 36 = 0$`,
              ru: R`$D = (-6)^2 - 4\cdot 1\cdot 9 = 36 - 36 = 0$`,
            },
          ],
        },
        {
          path: "c",
          label: "c",
          text: R`What does the value found in part (b) tell you about the graph of $y = x^2 - 6x + 9$?`,
          answer_type: "mcq",
          marks: 1,
          answer_spec: {
            options: [
              { id: "g1", text_md: R`It touches the $x$-axis at exactly one point` },
              { id: "g2", text_md: R`It crosses the $x$-axis at two points` },
              { id: "g3", text_md: R`It does not meet the $x$-axis` },
              { id: "g4", text_md: R`It lies entirely below the $x$-axis` },
            ],
            correct: ["g1"],
          },
          steps: [
            {
              code: "A1",
              marks: 1,
              en: R`$D=0$, so $y = (x-3)^2$ touches the $x$-axis at $x = 3$.`,
              ru: R`$D=0$, поэтому $y = (x-3)^2$ касается оси $x$ в точке $x=3$ — пересечения нет, есть касание.`,
            },
          ],
        },
      ],
    },

    // ═══ A-Level Mathematics · экзаменационная ══════════════════════════════
    {
      authorId,
      slug: "p1-stationary-points-of-a-cubic",
      kind: "exam",
      difficulty: 3,
      concepts: ["differentiation"],
      stem: R`The curve $C$ has equation
$$y = x^3 - 6x^2 + 9x + 2.$$`,
      parts: [
        {
          path: "a",
          label: "a",
          text: R`Find $\dfrac{dy}{dx}$ and hence the smaller value of $x$ at a stationary point.`,
          answer_type: "numeric",
          marks: 2,
          answer_spec: { value: 1, tolerance: 0 },
          steps: [
            {
              code: "M1",
              marks: 1,
              en: R`$\dfrac{dy}{dx} = 3x^2 - 12x + 9 = 3(x-1)(x-3)$, set equal to $0$.`,
              ru: R`$\dfrac{dy}{dx} = 3x^2 - 12x + 9 = 3(x-1)(x-3)$, приравниваем к нулю.`,
            },
            {
              code: "A1",
              marks: 1,
              en: R`The smaller root is $x = 1$.`,
              ru: R`Меньший корень: $x = 1$.`,
            },
          ],
        },
        {
          path: "b",
          label: "b",
          text: R`Write down the larger value of $x$ at a stationary point.`,
          answer_type: "numeric",
          marks: 1,
          answer_spec: { value: 3, tolerance: 0 },
          steps: [
            { code: "B1", marks: 1, en: R`$x = 3$`, ru: R`$x = 3$` },
          ],
        },
        {
          path: "c",
          label: "c",
          text: R`Determine the nature of the stationary point at the larger value of $x$.`,
          answer_type: "mcq",
          marks: 2,
          answer_spec: {
            options: [
              { id: "n1", text_md: R`A local minimum` },
              { id: "n2", text_md: R`A local maximum` },
              { id: "n3", text_md: R`A point of inflection` },
              { id: "n4", text_md: R`Cannot be determined without a sketch` },
            ],
            correct: ["n1"],
          },
          steps: [
            {
              code: "M1",
              marks: 1,
              en: R`$\dfrac{d^2y}{dx^2} = 6x - 12$, so at $x=3$ it equals $6$.`,
              ru: R`$\dfrac{d^2y}{dx^2} = 6x - 12$, при $x=3$ она равна $6$.`,
            },
            {
              code: "A1",
              marks: 1,
              en: R`Positive second derivative $\Rightarrow$ local minimum.`,
              ru: R`Вторая производная положительна $\Rightarrow$ локальный минимум. При $x=1$ она равна $-6$ — там максимум.`,
            },
          ],
        },
      ],
    },

    // ═══ Олимпиадная ════════════════════════════════════════════════════════
    // Разбор не обязателен по правилу вида, но здесь он есть: у олимпиадной
    // задачи ценность как раз в идее, а не в ответе.
    {
      authorId,
      slug: "olympiad-digital-root-of-a-power",
      kind: "olympiad",
      difficulty: 5,
      concepts: ["digital-roots"],
      stem: R`The *digital root* of a positive integer is obtained by repeatedly replacing the
number by the sum of its digits until a single digit remains. For example,
$$493 \to 4+9+3 = 16 \to 1+6 = 7.$$
Consider the digital root of $7^{\,n}$.`,
      explanation: R`Ключ ко всей задаче — одно наблюдение: **цифровой корень числа равен его
остатку при делении на 9** (с оговоркой, что вместо остатка $0$ пишут $9$).

Почему так. Число $\overline{a_k \ldots a_1 a_0}$ равно
$\sum a_i \cdot 10^i$, а $10 \equiv 1 \pmod 9$, поэтому $10^i \equiv 1 \pmod 9$ и
$$\sum a_i \cdot 10^i \equiv \sum a_i \pmod 9.$$
Сумма цифр не меняет остаток по модулю 9. Значит, и повторение операции его
не меняет, а заканчивается процесс на однозначном числе — то есть ровно на
представителе остатка.

Дальше задача перестаёт быть про цифры и становится про степени по модулю 9:
$$7^1 \equiv 7,\quad 7^2 \equiv 49 \equiv 4,\quad 7^3 \equiv 28 \equiv 1,\quad 7^4 \equiv 7 \pmod 9.$$
Цикл длины $3$: $7, 4, 1$.

Остаётся $2024 = 3\cdot 674 + 2$, то есть второй элемент цикла: **4**.

**Что здесь на самом деле произошло.** Задача выглядела как задача про запись
числа, а оказалась задачей про мультипликативный порядок $7$ по модулю $9$.
Это типичный олимпиадный ход: перевести условие в модульную арифметику,
где у объекта появляется конечная структура. Разложить $7^{2024}$ в столбик
не смог бы никто — и это подсказка, что считать не нужно.`,
      parts: [
        {
          path: "a",
          label: "a",
          text: R`Find the digital root of $7^2$.`,
          answer_type: "numeric",
          marks: 1,
          answer_spec: { value: 4, tolerance: 0 },
          steps: [
            {
              code: "B1",
              marks: 1,
              en: R`$7^2 = 49 \to 4+9 = 13 \to 1+3 = 4$.`,
              ru: R`$7^2 = 49 \to 4+9 = 13 \to 1+3 = 4$.`,
            },
          ],
        },
        {
          path: "b",
          label: "b",
          text: R`The digital roots of $7^1, 7^2, 7^3, \ldots$ repeat with a fixed period. State that period.`,
          answer_type: "numeric",
          marks: 1,
          answer_spec: { value: 3, tolerance: 0 },
          steps: [
            {
              code: "B1",
              marks: 1,
              en: R`$7 \equiv 7$, $7^2 \equiv 4$, $7^3 \equiv 1 \pmod 9$, then it repeats: period $3$.`,
              ru: R`$7 \equiv 7$, $7^2 \equiv 4$, $7^3 \equiv 1 \pmod 9$, дальше повтор: период $3$.`,
            },
          ],
        },
        {
          path: "c",
          label: "c",
          text: R`Hence find the digital root of $7^{\,2024}$.`,
          answer_type: "numeric",
          marks: 2,
          answer_spec: { value: 4, tolerance: 0 },
          steps: [
            {
              code: "M1",
              marks: 1,
              en: R`$2024 = 3 \times 674 + 2$, so $7^{2024}$ sits at position $2$ in the cycle.`,
              ru: R`$2024 = 3 \cdot 674 + 2$, значит $7^{2024}$ стоит на второй позиции цикла.`,
            },
            {
              code: "A1",
              marks: 1,
              en: R`The digital root is $4$.`,
              ru: R`Цифровой корень равен $4$.`,
            },
          ],
        },
      ],
    },
  ];
}
