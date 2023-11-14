// Import required modules
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const flash = require('express-flash');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const qrcode = require('qrcode');
const moment = require('moment');
const dotenv = require('dotenv');
const multer = require('multer');
let result = dotenv.config();
const path = require('path');



const app = express();

app.use(express.urlencoded({ extended: true }));
// Create a new Express app
app.use(bodyParser.json());

const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USERNAME;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_DATABASE;

// Set up session middleware
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

//acces css file
app.use(express.static(__dirname = "public"));


// Set the view engine to EJS
app.set('view engine', 'ejs');

//app.post('/check_in', (req, res) => {
  // Process the check-in request and display an alert message
 // res.send("<script>alert('You are checked in');</script>");
//});


// Set up body-parser middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Set up MySQL connection pool
const pool = mysql.createPool({
  host: dbHost,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


// Set up multer to handle file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './public/uploads'); // Directory where uploaded files will be stored
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname); // Rename the file with a timestamp to avoid name conflicts
  },
});

const upload = multer({ storage });

// Middleware to check for a session
app.use((req, res, next) => {
  if (req.session.user || req.path === '/login' || req.path === '/register') {
    next();
  } else {
    res.redirect('/login');
  }
});

// Middleware to check for a session and pass user data to the views
app.use((req, res, next) => {
  res.locals.user = req.session.user; // Pass the user data to the views
  next();
});

// Render the registration form
app.get('/register', (req, res) => {
    res.render('register.ejs');
});

// Define a middleware to set the current page in the request object
app.use((req, res, next) => {
  res.locals.currentPage = req.url;
  next();
});

// Process the registration form
app.post('/register', (req, res) => {
    const { user_name, email,password, cellphone, birthdate, gender } = req.body;

    // Hash the password
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.log(err);
            res.redirect('/register');
            return;
        }

        // Insert the user into the database
        pool.query('INSERT INTO join_users (user_name, email, password, cellphone, birthdate, gender) VALUES (?, ?, ?, ?, ?, ?)', [user_name, email,hash, cellphone, birthdate, gender], (err, result) => {
            if (err) {
                console.log(err);
                res.redirect('/register');
                return;
            }

            res.redirect('/login');
        });
    });
});

//login route
app.get('/login', (req, res) => {
  res.render('login.ejs');
});

//login route
app.get('/', (req, res) => {
  res.render('createTransaction.ejs');
});

//login function
app.post('/login', (req, res) => {
  const { user_name, password } = req.body;

  pool.query('SELECT * FROM join_users WHERE user_name = ?', [user_name], async (error, results) => {
    if (error) {
      console.log(error);
      res.redirect('/login');
      return;
    }

    if (results.length === 0) {
      req.flash('error', 'Incorrect username');
      res.redirect('/login');
      return;
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      req.flash('error', 'Incorrect password');
      res.redirect('/login');
      return;
    }

    req.session.user = user;
    res.redirect('/projects');
  });
});


//login route
app.get('/add_project', (req, res) => {
  res.render('createProject.ejs');
});

// Handle the form submission with multiple file uploads
app.post('/add_project', upload.array('files'), (req, res) => {
  const { name, author, description, category, start_date, status } = req.body;
  const files = req.files; // Get the array of uploaded files

  // Get the file paths from the uploaded files
  const file_paths = files.map((file) => file.path);

  // Insert the form data and file paths into the 'projects' table
  const sql = 'INSERT INTO join_projects (name, author, description, category, start_date, status, file_paths) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const values = [name, author, description, category, start_date, status, JSON.stringify(file_paths)];

  pool.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error inserting data into projects table:', err);
      res.send('Error inserting data into projects table');
    } else {
      console.log('Data inserted successfully:', result);
      res.send('Data inserted successfully into projects table');
    }
  });
});

app.get('/projects', (req, res) => {
  // Execute the SQL query
  pool.query(`
    SELECT join_projects.id, join_projects.name, join_projects.start_date, COUNT(join_participants.project_id) AS participantCount
    FROM join_projects
    LEFT JOIN join_participants ON join_projects.id = join_participants.project_id
    GROUP BY join_projects.id, join_projects.name, join_projects.start_date;
  `, (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      // Handle the error as needed (e.g., display an error message).
      return;
    }

    console.log('Project ID | Project Name | Start Date | Participant Count');
    console.log('---------------------------------------------------------');
    results.forEach((row) => {
      console.log(`${row.id} | ${row.name} | ${row.start_date} | ${row.participantCount}`);
    });

    // Assuming "results" contains the project data, render the EJS template
    res.render('showProjects', { projects: results });
  });
});

  // Fetch projects corresponding to user_id from the database and show the latest trip first
  app.get('/count', (req, res) => {
    const sql = 'SELECT * FROM join_projects';
  
    pool.query(sql, (err, results) => {
      if (err) {
        console.error('Error fetching projects:', err);
        res.send('Error fetching projects');
      } else {
        const projects = results; // Renamed 'trips' to 'chauffeurs' to match the view variable
        res.render('count', { title: 'projects', projects }); // Render the EJS template with the chauffeurs data
      }
    });
  });

  // Define a route to display a single record from the project table
app.get('/project/:id', (req, res) => {
  // Retrieve the project ID from the URL parameter
  const id = req.params.id;

  // Query your database to count how many times the project ID appears in participants
  // For example, if you're using MySQL:
  const sql = 'SELECT COUNT(*) AS projectCount FROM join_participants WHERE project_id = ?';
  pool.query(sql, [id], (err, result) => {
    if (err) {
      console.error('Error fetching data: ' + err.stack);
      res.status(500).send('Error fetching data');
      return;
    }
    const projectCount = result[0].projectCount;

    // Retrieve the project ID from the URL parameter
    const projectId = id;

    // Assuming you have a 'showSingleProject.ejs' template
    // Pass both projectCount and projectId as variables when rendering the template
    res.render('join.ejs', { projectCount: projectCount, projectId: projectId });
  });
});

// Define a route to display a single record from the project table
app.get('/project/:id/details', (req, res) => {
  // Retrieve the record with the specified ID from the project table
  const id = req.params.id;

  // Query your database to fetch the record with the given ID from the project table
  // Replace this with your actual database query logic
  // For example, if you're using MySQL:
  const sql = 'SELECT * FROM join_projects WHERE id = ?';
  pool.query(sql, [id], (err, result) => {
    if (err) {
      console.error('Error fetching data: ' + err.stack);
      res.status(500).send('Error fetching data');
      return;
    }
    const record = result[0]; // Assuming you fetch one record
    res.render('showSingleProject.ejs', { projects: record });
  });
});

app.get('/project/:id/participants', (req, res) => {
  // Retrieve the project ID from the URL parameter
  const projectId = req.params.id;

  // Query your database to fetch all records with the given project ID from the participants table
  const sql = 'SELECT * join_participants WHERE project_id = ?';

  pool.query(sql, [projectId], (err, results) => {
    if (err) {
      console.error('Error fetching data: ' + err.stack);
      res.status(500).send('Error fetching data');
      return;
    }

    // Pass the results to the EJS template
    res.render('showParticipants.ejs', { participants: results });
  });
});




// Define a route to render the form.
app.get('/add_participant', (req, res) => {
  res.render('createParticipant');
});

// Define a route to handle form submission.
app.post('/participants/create', (req, res) => {
  const { user_id, status, project_id } = req.body;

  const currentDate = new Date();
  const johannesburgOffset = 2; // Johannesburg is UTC+2
  const johannesburgTime = new Date(currentDate.getTime() + johannesburgOffset * 60 * 60 * 1000);
  const year = johannesburgTime.getFullYear();
  const month = String(johannesburgTime.getMonth() + 1).padStart(2, '0');
  const day = String(johannesburgTime.getDate()).padStart(2, '0');
  const hours = String(johannesburgTime.getHours()).padStart(2, '0');
  const minutes = String(johannesburgTime.getMinutes()).padStart(2, '0');
  const seconds = String(johannesburgTime.getSeconds()).padStart(2, '0');

  const created_at = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  // Insert data into the "participants" table.
  const insertQuery = 'INSERT INTO join_participants (user_id, status, created_at, project_id) VALUES (?, ?, ?, ?)';
  const values = [user_id, status, created_at, project_id];

  pool.query(insertQuery, values, (err, results) => {
    if (err) {
      console.error('Error inserting data into MySQL:', err);
      // Handle the error as needed (e.g., display an error message).
      return;
    }

    console.log('Inserted a new participant record');
    // Redirect to a success page or another route.
    res.redirect('/projects');
  });
});


// Logout route
app.get('/logout', (req, res) => {
  // Destroy the session and logout the user
  req.session.destroy(err => {
    if (err) {
      console.log(err);
      res.redirect('/');
      return;
    }

    // Redirect the user to the desired page after successful logout
    res.redirect('/login');
  });
});

// Start the server
app.listen(3000, () => {
    console.log('Server started on port 3000');
});
