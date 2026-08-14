-- 005 — порядок комиссий в интерфейсе.
--
-- До этого комиссии сортировались по id, то есть по алфавиту, и комиссия
-- по умолчанию выбиралась случайно. Порядок показа — продуктовое решение
-- и должен лежать данными, а не выпадать из сортировки.

alter table board add column position int not null default 0;

update board set position = 1 where id = 'edexcel';
update board set position = 2 where id = 'cie';
