const express = require('express');
const mysql = require('mysql');
const cors = require('cors');

const app = express();
const port = 5000;

const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: 'admin',
  database: 'lectures',
});

db.connect((err) => {
  if (err) {
    throw err;
  }
  console.log('Connected to MySQL database');
});

app.use(cors());
app.use(express.json());

//Вход администратора
app.post('/login', (req, res) => {
  const { login, password } = req.body;

  // Проверяем, что переданы оба поля логина и пароля
  if (!login || !password) {
    return res.status(400).json({ message: 'Введите логин и пароль' });
  }

  // Проверяем, является ли пользователь администратором
  db.query('SELECT * FROM teachers WHERE login = ? AND password = ?', [login, password], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: 'Неверные учетные данные или не являетесь администратором' });
    }

    // Авторизация успешна
    res.status(200).json({ message: 'Авторизация успешна' });
  });
});

//Запросы от студентов
app.post('/request', (req, res) => {
  const { studentId } = req.body;

  // Проверяем, что передан номер зачетки студента
  if (!studentId) {
    return res.status(400).json({ message: 'Введите номер зачетки студента' });
  }

  // Проверяем, существует ли студент с указанным номером зачетки
  db.query('SELECT * FROM students WHERE student_id = ?', [studentId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Студент с указанным номером зачетки не найден' });
    }

    const student = results[0];
    const teacherId = 1; // Идентификатор преподавателя, к которому отправляется запрос

    // Проверяем, существуют ли уже статусы "approved" или "rejected" у студента
    if (student.status === 'approved') {
      // Возвращаем сообщение, что студент одобрен и можно войти
      return res.status(200).json({ message: 'Студент одобрен, можно войти' });
    } else if (student.status === 'rejected') {
      // Возвращаем сообщение, что студента не одобрили
      return res.status(403).json({ message: 'Вас не одобрили' });
    }

    // Проверяем, существует ли уже запрос от данного студента
    db.query('SELECT * FROM student_requests WHERE student_id = ? AND teacher_id = ?', [student.id, teacherId], (err, existingRequests) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ошибка сервера' });
      }

      if (existingRequests.length > 0) {
        return res.status(409).json({ message: 'Запрос от данного студента уже существует' });
      }

      // Добавляем запись о запросе в таблицу student_requests
      db.query('INSERT INTO student_requests (student_id, teacher_id) VALUES (?, ?)', [student.id, teacherId], (err, insertResult) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Ошибка сервера' });
        }
  
        const requestId = insertResult.insertId;
  
        // Получаем информацию о преподавателе
        db.query('SELECT * FROM teachers WHERE id = ?', [teacherId], (err, teacherResult) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Ошибка сервера' });
          }
  
          if (teacherResult.length === 0) {
            return res.status(404).json({ message: 'Преподаватель не найден' });
          }
  
          const teacher = teacherResult[0];
  
          // Отправляем ответ с информацией о запросе
          res.status(200).json({ message: 'Запрос отправлен', requestId, teacher });
        });
      });

    });   
  });
});

// Получение списка запросов
app.get('/admin/requests', (req, res) => {
  db.query('SELECT id, student_id, teacher_id FROM student_requests', (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }

    const requests = results.map((row) => {
      return {
        id: row.id,
        studentId: row.student_id,
        teacherId: row.teacher_id
      };
    });

    res.status(200).json(requests);
  });
});

//Одобрение запроса
app.post('/admin/requests/:requestId/approve', (req, res) => {
  const { requestId } = req.params;

  // Обновление статуса в таблице "student_requests" и связанных данных в таблице "students"
  const query = `UPDATE student_requests AS sr
    JOIN students AS s ON sr.student_id = s.id
    SET sr.status = "approved", s.status = "approved"
    WHERE sr.id = ?`;

  db.query(query, [requestId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Запрос не найден' });
    }

    // Удаление записи из таблицы "student_requests"
    db.query('DELETE FROM student_requests WHERE id = ?', [requestId], (err, deleteResult) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ошибка сервера' });
      }

      res.status(200).json({ message: 'Request approved. Student status updated. Request deleted.' });
    });
  });
});

// Отклонение запроса
app.post('/admin/requests/:requestId/reject', (req, res) => {
  const { requestId } = req.params;

  // Обновление статуса в таблице "student_requests" и связанных данных в таблице "students"
  const query = `
    UPDATE student_requests AS sr
    JOIN students AS s ON sr.student_id = s.id
    SET sr.status = "rejected", s.status = "rejected"
    WHERE sr.id = ?`;

  db.query(query, [requestId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Запрос не найден' });
    }

    // Удаление записи из таблицы "student_requests"
    db.query('DELETE FROM student_requests WHERE id = ?', [requestId], (err, deleteResult) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ошибка сервера' });
      }

      res.status(200).json({ message: 'Request rejected. Student status updated. Request deleted.' });
    });
  });
});

//Получение списка лекций
app.get('/lectures', (req, res) => {
  db.query('SELECT id, title, description, difficulty FROM lectures', (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }

    const lectures = results.map((row) => {
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        difficulty: row.difficulty,
      };
    });

    res.status(200).json(lectures);
  });
});


// Добавление новой лекции
app.post('/addLecture', (req, res) => {
  const { title, description, difficulty } = req.body;

  // Проверяем, что переданы все поля
  if (!title || !description || !difficulty) {
    return res.status(400).json({ message: 'Введите название, описание и сложность лекции' });
  }

  // Проверяем корректность значения difficulty
  const validDifficulties = ['Начинающий', 'Средний', 'Продвинутый'];
  if (!validDifficulties.includes(difficulty)) {
    return res.status(400).json({ message: 'Указана недопустимая сложность' });
  }

  // Добавляем запись о лекции в таблицу lectures
  db.query('INSERT INTO lectures (title, description, difficulty, current_id) VALUES (?, ?, ?, ?)', [title, description, difficulty, null], (err, insertResult) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }

    const lectureId = insertResult.insertId;

    // Обновляем колонку current_id для сохранения идентификатора лекции
    db.query('UPDATE lectures SET current_id = ? WHERE id = ?', [lectureId, lectureId], (err, updateResult) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ошибка сервера' });
      }

      // Получаем информацию о добавленной лекции
      db.query('SELECT * FROM lectures WHERE id = ?', [lectureId], (err, lectureResult) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Ошибка сервера' });
        }

        if (lectureResult.length === 0) {
          return res.status(404).json({ message: 'Лекция не найдена' });
        }

        const lecture = lectureResult[0];

        // Отправляем ответ с информацией о добавленной лекции
        res.status(200).json(lecture);
      });
    });
  });
});

// Получение информации о конкретной лекции
app.get('/lectures/:lectureId', (req, res) => {
  const lectureId = req.params.lectureId;

  // Проверяем, что передан корректный идентификатор лекции
  if (!lectureId) {
    return res.status(400).json({ message: 'Укажите корректный идентификатор лекции' });
  }

  // Запрашиваем информацию о лекции из базы данных по идентификатору
  db.query('SELECT id, title, description, difficulty FROM lectures WHERE id = ?', [lectureId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Лекция не найдена' });
    }

    const lecture = results[0];

    res.status(200).json(lecture);
  });
});


app.delete('/lectures/:lectureId', (req, res) => {
  const lectureId = req.params.lectureId;

  // Проверяем, что передан корректный идентификатор лекции
  if (!lectureId) {
    return res.status(400).json({ message: 'Укажите корректный идентификатор лекции' });
  }

  // Удаляем запись о лекции из таблицы lectures
  db.query('DELETE FROM lectures WHERE id = ?', [lectureId], (err, deleteResult) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }

    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({ message: 'Лекция не найдена' });
    }

    res.status(200).json({ message: 'Лекция успешно удалена' });
  });
});


// Редактирование лекции
app.put('/lectures/:lectureId', (req, res) => {
  const lectureId = req.params.lectureId;
  const { title, description, difficulty } = req.body;

  // Проверяем, что переданы все поля
  if (!title || !description || !difficulty) {
    return res.status(400).json({ message: 'Введите название, описание и сложность лекции' });
  }

  // Проверяем, что значение lectureId не равно null
  if (!lectureId) {
    return res.status(400).json({ message: 'Укажите корректный идентификатор лекции' });
  }

  // Обновляем запись о лекции в таблице lectures
  db.query(
    'UPDATE lectures SET title = ?, description = ?, difficulty = ? WHERE current_id = ?',
    [title, description, difficulty, lectureId],
    (err, updateResult) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ошибка сервера' });
      }

      if (updateResult.affectedRows === 0) {
        return res.status(404).json({ message: 'Лекция не найдена' });
      }

      // Получаем информацию о обновленной лекции
      db.query('SELECT * FROM lectures WHERE id = ?', [lectureId], (err, lectureResult) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Ошибка сервера' });
        }

        if (lectureResult.length === 0) {
          return res.status(404).json({ message: 'Лекция не найдена' });
        }

        const lecture = lectureResult[0];

        // Отправляем ответ с информацией о обновленной лекции
        res.status(200).json(lecture);
      });
    }
  );
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});