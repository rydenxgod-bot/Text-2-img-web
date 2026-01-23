# 🖼️ Text to Image Web (RydenXGod AI)

A simple and fast **Text → Image generator web app** built using **React + TypeScript**.  
Type any prompt, generate an AI image instantly, and download it in one click.

This project is perfect for:
- Beginners learning React + API integration
- Developers who want a ready-to-deploy AI image generator
- Anyone who wants a clean UI for prompt → image creation

---

## ✨ What Users Can Do

- ✍️ Enter any text prompt
- ⚡ Generate AI images instantly
- 🖼️ View the generated image in preview
- ⬇️ Download the generated image to device
- 📱 Use smoothly on mobile & desktop

---

## 🚀 Features

✅ Text to Image Generation  
✅ Instant Preview (No waiting for URLs / direct rendering)  
✅ Download Image Button (Blob Download Method)  
✅ Cache Bypass (Always generates fresh images)  
✅ Clean UI + Mobile Responsive  
✅ One-click Deploy on Vercel  

---

## 🧑‍💻 How It Works (Simple Explanation)

This app generates images by sending your prompt to the AI image service.  
The API returns the image directly, so the app displays it instantly using an `<img src="...">`.

To avoid the same image loading again from browser cache, we add a unique `seed` value each time.

For downloads, we use a safe method:
- Fetch the image
- Convert it to a Blob
- Save it using a browser download trigger

---

## 🌍 Deploy on Vercel (Fork + Deploy)

You can deploy this project in **under 1 minute** 🚀

### ✅ Step 1: Fork the Repository
1. Open this repo on GitHub
2. Click the **Fork** button (top-right)
3. The project will be copied into your GitHub account

---

### ✅ Step 2: Deploy on Vercel
1. Visit **Vercel**
2. Click **Add New → Project**
3. Select your **forked GitHub repository**
4. Click **Deploy**

🎉 Done! Your AI image generator will be live instantly.

---

## 🔗 One-Click Deploy Button (Vercel)

Click this button to deploy instantly:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

> Tip: After clicking, select your forked repo and deploy.

---

## Credit 🔥❣️
© RydenXGod
Join us On telegram 
https://t.me/RydenXGod
