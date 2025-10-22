const express= require('express');
const app=express();
const {Pool}=require('pg');
const path=require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { hash } = require('crypto');
const router = express.Router();
app.use(express.urlencoded({ extended: true })); // parse form data
app.use(express.json());

app.set('view engine','ejs');

app.use(session({
    secret: 'mysecret', // any random string
    resave: false,
    saveUninitialized:false,
    cookie: {
        maxAge: 10 * 60 * 1000 // 10 minutes in milliseconds
    }
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
   
    const User = result.rows[0];
    const isMatch = await bcrypt.compare(password,User.password);
    if(!isMatch){
        return res.send(`
                <h2>Incorrect password!</h2>
                <a href='/login'>Try again</a>
            `);
    }
      req.session.userId = User.user_id;
      req.session.username = User.username;
     
      res.redirect('/fyp');
});


app.get("/profile", async (req, res) => {
    const userId = req.session.userId;
     if (!userId) {
        return res.redirect("/login");
    }
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

app.get('/new',async(req,res)=>{
    const userId=req.session.userId;
    if(!userId)
        return res.redirect('/login');
    const user = (await pool.query("SELECT * FROM users WHERE user_id=$1", [userId])).rows[0];
     if (!user) {
        return res.redirect('/login');
    }
    
    res.render("createPost",{user});
})

app.post('/new',async(req,res)=>{
    const userId=req.session.userId;
    if(!userId)
        return res.redirect('/login');
    const {title,caption,content,hashtags}=req.body;
    
    let hashtagsArray = null;
    if (hashtags && hashtags.trim() !== "") {
        hashtagsArray = hashtags.split(" ").map(tag => tag.trim()).filter(tag => tag !== "");// .split(" ") might produce empty strings in the array:
    }//To avoid this, you can filter out empty strings:
    await pool.query("insert into posts(user_id,title,caption,content,hashtags) values($1,$2,$3,$4,$5)",[userId,title,caption,content,hashtagsArray]);
    res.redirect('/profile');

});

app.get('/posts/:post_id',async(req,res)=>{
  const post_id=req.params.post_id;
  const userId=req.session.userId;
  if(!userId) return res.redirect('/login');

  const users=(await pool.query("SELECT * FROM users WHERE user_id=$1", [userId])).rows[0];
 const posts=(await pool.query("SELECT * FROM posts WHERE post_id=$1", [post_id])).rows;
    res.render("posts",{posts,users});
});

app.get('/posts/:post_id/update',async(req,res)=>{
    const postId=req.params.post_id;
    const userId=req.session.userId;
    if(!userId) return res.redirect('/login');
    const user=(await pool.query("SELECT * FROM users WHERE user_id=$1", [userId])).rows[0];
    const post=(await pool.query("SELECT * FROM posts WHERE post_id=$1", [postId])).rows[0];
    res.render("updatePost",{user,post});

});

app.post('/posts/:post_id/update',async(req,res)=>{
    const postId=req.params.post_id;
    if (isNaN(postId)) return res.send("Invalid post ID");
    const userId=req.session.userId;
    if(!userId) return res.redirect('/login');
    const { title, caption, content,hashtags} = req.body;

    let hashtagsArray = null;
    if (hashtags && hashtags.trim() !== "") 
        hashtagsArray = hashtags.split(" ").map(tag => tag.trim()).filter(tag => tag !== "");
 
    
    await pool.query('update posts set title=$1,caption=$2,content=$3,hashtags=$4 where post_id=$5',[title, caption, content,hashtagsArray,postId]);
    res.redirect('/profile');
    
})

app.post('/posts/:post_id/delete',async(req,res)=>{  //post request for the button
    const postId=req.params.post_id;
    if (isNaN(postId)) return res.send("Invalid post ID");
     const userId=req.session.userId;
    if(!userId) return res.redirect('/login');
    await pool.query('delete from posts where post_id=$1 and user_id=$2',[postId,userId]);
    res.redirect('/profile');

})
app.get('/posts/:post_id/delete', async (req, res) => { //get request when you type url manually
    const postId = req.params.post_id;
    if (isNaN(postId)) return res.send("Invalid post ID");
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');
    await pool.query('DELETE FROM posts WHERE post_id=$1 AND user_id=$2', [postId, userId]);
    res.redirect('/profile');
});


app.get("/fyp", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.redirect("/login");
    // Get logged-in user
    const userResult = await pool.query("SELECT user_id, username, email, bio FROM users WHERE user_id=$1",[userId]);
    const user = userResult.rows[0];

    // Get user's own posts
    const myPostsResult = await pool.query(
      "SELECT post_id, title, caption FROM posts WHERE user_id=$1 ORDER BY created_at DESC",
      [userId]
    );
    const myPosts = myPostsResult.rows;

    // Get all posts + usernames of their authors
    const allPostsResult = await pool.query(`
      SELECT posts.title, posts.caption, users.username
      FROM posts
      JOIN users ON posts.user_id = users.user_id
      ORDER BY posts.created_at DESC
      LIMIT 10
    `);
    const allPosts = allPostsResult.rows;

    res.render("fyp", { user, myPosts, allPosts });
  
  }
);


app.get('/home',(req,res)=>{
    res.send(`<html><h1>HIIIIIII</h1></html>`);
});


app.listen(3000,()=>{
    console.log(`http://localhost:3000/`);
})