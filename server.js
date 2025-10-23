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
        maxAge: 30 * 60 * 1000 // 10 minutes in milliseconds
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
  const posts = (await pool.query("SELECT * FROM posts WHERE user_id=$1", [userId])).rows;
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
    const posts=(await pool.query("select * from posts")).rows;
    const length=posts.length;
     if (!user) {
        return res.redirect('/login');
    }
    
    res.render("createPost",{user,length});
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

app.get('/posts',async (req,res)=>{
    const userId=req.session.userId;
    if(!userId) return res.redirect('/login');

  const users=(await pool.query("SELECT * FROM users WHERE user_id=$1", [userId])).rows[0];
   const posts=(await pool.query("SELECT * FROM posts where user_id=$1",[userId])).rows;
   res.render("posts",{users,posts});

})

app.get('/posts/:post_id',async(req,res)=>{
  const post_id=req.params.post_id;
  const userId=req.session.userId;
  if(!userId) return res.redirect('/login');

  const users=(await pool.query("SELECT * FROM users WHERE user_id=$1", [userId])).rows[0];
 const posts=(await pool.query("SELECT * FROM posts WHERE post_id=$1", [post_id])).rows;
    res.render("posts",{posts,users});
});

app.get('/posts/:post_id/update',async(req,res)=>{
    const postId=parseInt(req.params.post_id);
    if (isNaN(postId)) return res.send("Invalid post ID");
    const userId=req.session.userId;
    if(!userId) return res.redirect('/login');
    const user=(await pool.query("SELECT * FROM users WHERE user_id=$1", [userId])).rows[0];
    const post=(await pool.query("SELECT * FROM posts WHERE post_id=$1", [postId])).rows[0];
    res.render("updatePost",{user,post});

});

app.post('/posts/:post_id/update',async(req,res)=>{
    const postId=parseInt(req.params.post_id);
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

        // 1. Get logged-in user details
        const userResult = await pool.query(
        "SELECT user_id, username, email, bio FROM users WHERE user_id=$1",
        [userId]
        );
        const user = userResult.rows[0];

        // 2. Get user's own posts with liked_by_user info
        const myPostsResult = await pool.query(
        `SELECT p.post_id, p.title, p.caption, p.content, p.hashtags, p.likes_count, p.comments_count,
                EXISTS (
                    SELECT 1 FROM likes WHERE likes.user_id=$1 AND likes.post_id=p.post_id
                ) AS liked_by_user
        FROM posts p
        WHERE p.user_id=$1
        ORDER BY p.created_at DESC`,
        [userId]
        );
        const myPosts = myPostsResult.rows;

        // 3. Get all posts with author usernames and liked_by_user info
        const allPostsResult = await pool.query(
        `SELECT p.post_id, p.title, p.caption, p.content, p.hashtags, p.likes_count, p.comments_count,
                u.username,
                EXISTS (
                    SELECT 1 FROM likes WHERE likes.user_id=$1 AND likes.post_id=p.post_id
                ) AS liked_by_user,
                 EXISTS (
                 SELECT 1 FROM saved_posts WHERE saved_posts.user_id = $1 AND saved_posts.post_id = p.post_id
                 ) AS saved_by_user
        FROM posts p
        JOIN users u ON p.user_id = u.user_id
        ORDER BY p.created_at DESC`,
        [userId]
        );
        const allPosts = allPostsResult.rows;
        res.render("fyp", { user, myPosts, allPosts });
    });



    app.post("/likes/:postId", async (req, res) => {
    const userId = req.session.userId;
    const postId = req.params.postId;
    if (!userId) return res.redirect("/login");

    
        // check if user already liked this post
        const existing = await pool.query(
        "SELECT * FROM likes WHERE user_id=$1 AND post_id=$2",
        [userId, postId]
        );

        if(existing.rowCount === 0) { //like
        await pool.query("INSERT INTO likes (user_id, post_id) VALUES ($1, $2)",[userId, postId]);
        await pool.query("UPDATE posts SET likes_count = likes_count + 1 WHERE post_id=$1",[postId]);
        }
        
        else if (existing.rowCount > 0) { //dislike
        await pool.query( "DELETE FROM likes WHERE user_id=$1 AND post_id=$2", [userId, postId] ); 
        await pool.query( "UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE post_id=$1", [postId] ); }
        res.redirect("/fyp");
    
    });

    app.get('/comments/:post_id',async (req,res)=>{
        const userId = req.session.userId;
    const postId = req.params.post_id;
    if (!userId) return res.redirect("/login");
    const comment=(await pool.query('select c.* ,u.username from comments c join users u on c.user_id=u.user_id where c.post_id=$1 ORDER BY c.created_at ASC',[postId])).rows;
    const post=(await pool.query('select p.*,u.username from posts p JOIN users u ON p.user_id = u.user_id where post_id=$1',[postId])).rows[0];
    res.render("comments",{comment,post});

    });

    app.post('/comments/:post_id',async(req,res)=>{
    const userId = req.session.userId;
    const postId = req.params.post_id;
    const { comment } = req.body;
    if (!userId) return res.redirect("/login")

    if (comment && comment.trim() !== "") {
      await pool.query("INSERT INTO comments (user_id, post_id, comment) VALUES ($1, $2, $3)",[userId, postId, comment.trim()]);
      await pool.query("UPDATE posts SET comments_count = comments_count + 1 WHERE post_id = $1",[postId]);
    }
   res.redirect(`/comments/${postId}`);
    });

    app.post("/save/:postId", async (req, res) => {
        const userId = req.session.userId;
  const postId = req.params.postId;
  if (!userId) return res.redirect("/login");
        
 const existing = await pool.query( "SELECT * FROM saved_posts WHERE user_id=$1 AND post_id=$2", [userId, postId]);
      if (existing.rowCount > 0) 
        await pool.query( "DELETE FROM saved_posts WHERE user_id=$1 AND post_id=$2", [userId, postId]);
    else
        await pool.query(
        "INSERT INTO saved_posts (user_id, post_id) VALUES ($1, $2)", [userId, postId]);
        res.redirect("/fyp");
        });

   



/*app.get('/home',(req,res)=>{
    res.send(`<html><h1>HIIIIIII</h1></html>`);
});*/


app.listen(3000,()=>{
    console.log(`http://localhost:3000/`);
})