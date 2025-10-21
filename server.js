const express= require('express');
const app=express();
const {Pool}=require('pg');
const path=require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { hash } = require('crypto');
const router = express.Router();

app.set('view engine','ejs');


app.use(express.urlencoded({ extended: true })); // parse form data
app.use(express.json());


app.use(session({
    secret: 'mysecret', // any random string
    resave: false,
    saveUninitialized: true
}));

require('dotenv').config();
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});
app.use(express.static(path.join(__dirname, '../public')));

app.get('/',(req,res)=>{
    res.sendFile(path.join(__dirname,'/public/index.html'));
});
app.get('/signup',(req,res)=>{
    res.sendFile(path.join(__dirname,'/public/signup.html'));
})
app.get('/login',(req,res)=>{
    res.sendFile(path.join(__dirname,'/public/login.html'));
})

app.post('/signup',async(req,res)=>{
    const{username,email,password}=req.body;
    const result= await pool.query('select * from users where email=$1',[email]);
    if(result.rows.length>0)
    {
        return res.send(`<h2>email already exists</h2>
            <a href='/login'>try logging in instead </a>`);
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('insert into users(username,email,password) values($1,$2,$3)',[username,email,hashedPassword]);
    res.send(`<h3> Succesfully created an account" </h3><br><br><a href='/login'> click here to log in </a>`);
});

app.post('/login',async(req,res)=>{
    const {email,password}=req.body;
    const result=await pool.query('select * from users where email=$1',[email]);
    if(result.rows.length==0)
        {
        return res.send(`<h2>user not found!</h2>
            <a href='/signup'>try creating an account first</a>`);
    }
   
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password,user.password);
    if(!isMatch){
        return res.send(`
                <h2>Incorrect password!</h2>
                <a href='/login'>Try again</a>
            `);
    }
      req.session.userId = user.user_id;
      req.session.username = user.username;
      return res.redirect('/profile');
});


app.get("/profile", async (req, res) => {
    const userId = req.session.userId;
  const user = (await pool.query("SELECT user_id, username, email, bio FROM users WHERE user_id=$1", [userId])).rows[0];
  const posts = (await pool.query("SELECT post_id, title FROM posts WHERE user_id=$1", [userId])).rows;
    res.render("profile", { user,posts });
})

app.get("/profile/edit",async(req,res)=>{
    const userId=req.session.userId;
    const user = (await pool.query("SELECT * FROM users WHERE user_id=$1", [userId])).rows[0];
     if (!user) {
      return res.redirect("/login"); // redirect if not logged in
    }
  res.render("editProfile", { user });
})

app.post('/profile/edit',async(req,res)=>{
    const userId=req.session.userId;
    if (!userId) return res.redirect("/login");
    const{username,bio,password}=req.body;
    if (password && password.trim() !== "")
    {
        const hashed = await bcrypt.hash(password,10);
        await pool.query("update users set username=$1, bio=$2, password=$3 where user_id=$4",[username,bio,hashed,userId]);
    }
    else
        await pool.query("UPDATE users SET username=$1, bio=$2 WHERE user_id=$3", [username, bio, userId]);
    res.redirect("/profile");
})

app.get('/home',(req,res)=>{
    res.send(`<html><h1>HIIIIIII</h1></html>`);
});
app.listen(3000,()=>{
    console.log(`http://localhost:3000`);
})