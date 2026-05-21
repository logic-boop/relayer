# ⚡ Relayer — Real-Time Portal MVP

Relayer is a high-fidelity, real-time messaging application MVP engineered using modern serverless architecture. The platform features instantaneous message delivery, persistence via a cloud database, and live interactive animations to mimic a premium chat portal.

---

## ✨ Features

* **Real-Time P2P Messaging:** Sub-second packet message delivery across client contexts utilizing WebSockets.
* **Live "Typing..." Indicators:** Reactive client-side interaction signals triggered on active text inputs.
* **Persistent Cloud Architecture:** Full storage integration to preserve conversation history.
* **Elite Interface Aesthetics:** Premium dark-themed workspace layout optimized for seamless responsiveness across both mobile and desktop screens.

---

## 🛠️ Tech Stack

* **Framework:** Next.js (App Router, React Server Components)
* **Real-Time Infrastructure:** Pusher Channels (WebSocket Gateway)
* **Database Layer:** Supabase (PostgreSQL Cloud Instance)
* **Styling & Icons:** Tailwind CSS & Lucide React

---

## 🚀 Local Development Setup

Follow these steps to run the project locally:

### 1. Clone the repository
```bash
git clone [https://github.com/logic-boop/relayer.git](https://github.com/logic-boop/relayer.git)
cd relayer

2. Install dependencies
    npm install

3. Configure environment variables
Create a .env.local file in the root directory and add your infrastructure credentials:
# Pusher Credentials
NEXT_PUBLIC_PUSHER_KEY=your_pusher_key
NEXT_PUBLIC_PUSHER_CLUSTER=your_pusher_cluster
PUSHER_APP_ID=your_pusher_app_id
PUSHER_SECRET=your_pusher_secret

# Supabase Credentials
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_secret

4. Boot the development server
    npm run dev
    Open http://localhost:3000 with your browser to see the result.

⚙️ Core Architecture Design
/api/messages: Multi-method routing pipeline handling POST requests to write incoming data arrays to PostgreSQL while triggering real-time broadcasts, and GET requests to load chat logs on user session validation.

/api/typing: Lightweight network endpoint to handle and broadcast live active input state streams without overloading database rows.

