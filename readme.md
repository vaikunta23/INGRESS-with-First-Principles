# Ingress from first principles


### Exposing a Fullstack Application in Kubernetes with Just **One LoadBalancer**


When we first learn Kubernetes, one of the first big questions is:

*“How do I make my application available to the internet?”*

The answer usually starts with the **LoadBalancer service**.

A LoadBalancer service gives your pod(s) a public IP. Your cloud provider (or local setup like Minikube/Kind) provisions a load balancer, and suddenly—boom—you can curl your service from anywhere on the internet.

But here’s the catch: when you start building **real applications**, things get complicated.


### The Naive Way: One LoadBalancer per Service


Imagine we’re deploying a simple **fullstack app** in Kubernetes:

- **Frontend** → React app
- **Backend** → Express.js (Node.js) app
- **Database** → Postgres

Now, if you don’t know about **Ingress** yet, your first instinct might be:

- Frontend needs internet → **give it a LoadBalancer**
- Backend needs internet → **give it another LoadBalancer**
- Database needs internet (maybe?) → **give it another LoadBalancer**

That’s **3 LoadBalancers = 3 Public IPs**.

😬 Expensive.

😬 Messy.

😬 And, honestly, insecure.


> **“Our goal is to deploy a full-stack application using a single LoadBalancer service, without relying on an Ingress controller. This approach helps us understand how Ingress works by first learning the underlying principles of traffic routing with just services, ClusterIPs, and Nginx.”**
> 


### Do we really need to expose all 3 to the internet?


Let’s break it down carefully:

1. **Database (Postgres)**
    - Should we expose it?
    - Answer: **No.**
        
        Why would we want the whole world to connect to our DB? Only our backend should talk to the DB.
        
        So DB should stay **inside the cluster only**, accessible privately.
        
        Service Type: **ClusterIP**
        
2. **Backend (Express app)**
    - Should we expose it?
    - Answer: **No.**
        
        The backend doesn’t need to be exposed to the world directly. Only the frontend and maybe Nginx should connect to it.
        
        Service Type: **ClusterIP**
        
3. **Frontend (React app)**
    - Should we expose it? (not directly)
    - Answer: **No.**
        
        Instead, we will put **Nginx** in front of it, so that Nginx serves the frontend.
        
        Service Type: **ClusterIP**
        


### The Smarter Way: One Gateway (Nginx)


Instead of exposing everything, we expose only **one thing** → **Nginx**.

Nginx acts like a **mini-ingress**:

- It listens on port 80 (HTTP).
- It serves the **frontend app**.
- It proxies API calls (`/api/*`) to the **backend**.
- The backend talks to Postgres internally.

So to the outside world, it feels like:

→ `http://app.mydomain.com`

But under the hood:

- `/` → Frontend
- `/api` → Backend
- Backend → Postgres (ClusterIP)

![image.png](https://github.com/user-attachments/assets/7a23a47c-644c-43e2-a782-8dc058974733)


### Nginx Configuration


Here’s what our `/etc/nginx/nginx.conf` looks like:

```
events { worker_connections 1024; }

http {
  server {
    listen 80;
    server_name app.vaikuntech.in;

    # Frontend
    location / {
      proxy_pass http://frontend.frontend-team.svc.cluster.local:80;
    }

    # Backend (proxied via /api)
    location /api/ {
      proxy_pass http://backend.backend-team.svc.cluster.local:3000/;
    }
  }
}
```

Explanation:

- `/` → goes to frontend service inside cluster
- `/api/` → goes to backend service inside cluster
- Backend internally connects to Postgres using a **ClusterIP**

So with this, only **Nginx LoadBalancer** gets a public IP.


### Flow of Requests


1. User → `http://app.vaikuntech.in`
2. DNS → resolves to LoadBalancer IP
3. LoadBalancer → sends traffic to Nginx pod
4. Nginx → serves frontend on `/`
5. Frontend → calls `/api/...`
6. Nginx → proxies `/api` to backend
7. Backend → queries Postgres via ClusterIP

Only one thing (Nginx) touches the internet. Everything else stays private inside the cluster.


### Kubernetes Services Setup


- **Postgres** → `ClusterIP` (internal only)
- **Backend** → `ClusterIP` (internal only)
- **Frontend** → `ClusterIP` (internal only)
- **Nginx** → `LoadBalancer` (public)


### Why is this good?


- Only **1 LoadBalancer** = cheaper, simpler
- **DB is secure** (not exposed publicly)
- **Backend is protected** (only frontend/nginx can reach it)
- Scalable → if tomorrow you add more services, you don’t need more LoadBalancers


**What we just built is basically a poor man’s ingress controller.**

**It works, but it’s manual—you write the Nginx config yourself.**

**Later, when we learn about Ingress + Ingress Controllers, we’ll see that Kubernetes automates this exact pattern. Instead of writing configs manually, you just declare rules in YAML and let the controller do the heavy lifting.**

**So by doing it this way, we’ve learned Ingress from first principles 💡.**


### Step-by-Step Deployment Guide


We’ve already built our architecture:

- **Postgres (DB)** → ClusterIP (private)
- **Backend (Node/Express)** → ClusterIP (private)
- **Frontend (React)** → ClusterIP (private)
- **Nginx Reverse Proxy** → LoadBalancer (public entrypoint)

Now let’s deploy this step by step.


### 1. Push Docker Images to DockerHub

First, we need our images available in a registry (so Kubernetes can pull them). We’ll use DockerHub here.

**Frontend Image**

```bash
docker buildx build --platform linux/amd64 -t poizn2331/k8s-frontend:latest . --push
```

**Backend Image**

```bash
docker buildx build --platform linux/amd64 -t poizn2331/k8s-backend:latest . --push
```

Since I’m using a Mac (which defaults to **arm64**), I add the `--platform linux/amd64` flag so that the images I push to DockerHub are compatible with most Kubernetes clusters, which typically run on **amd64** nodes.


### 2. Deploy the Database

Now, let’s deploy Postgres inside our cluster.

```bash
kubectl apply -f ops/db/manifest.yaml
```

- Service type: **ClusterIP** (only backend can access it).
- Pod/Deployment: runs Postgres container.
- Credentials: usually provided via **Secrets**.


### 3. Deploy the Backend

Next, we deploy our backend API.

```bash
kubectl apply -f ops/server/manifest.yaml
```

- Service type: **ClusterIP** (internal only).
- Connects to Postgres using the internal DNS name (`postgres.db.svc.cluster.local`).
- Exposes port `3000` internally.


### 4. Deploy the Frontend

Now, let’s deploy our React frontend.

```bash
kubectl apply -f ops/client/manifest.yaml
```

- Service type: **ClusterIP** (internal only).
- Nginx reverse proxy will fetch and serve it to the outside world.


### 5. Deploy the Reverse Proxy (Nginx)

Finally, the gateway to the internet.

```bash
kubectl apply -f ops/reverse-proxy/manifest.yaml
```

- Service type: **LoadBalancer** → gets a public IP.
- Routes `/` → frontend
- Routes `/api/` → backend
- Backend internally talks to Postgres.


### **6. Verify Deployment**

Check if all pods are running:

```bash
kubectl get pods
```

You should see something like: (since only nginx is running on default namespace)

```docker
NAME                             READY   STATUS    RESTARTS   AGE
nginx-gateway-6bc684765b-9bz7x   1/1     Running   0          89m
```

Check services and public IP:

```bash
kubectl get svc
```

You should see something like:

```
NAME           TYPE           CLUSTER-IP       EXTERNAL-IP     PORT(S)       AGE
kubernetes     ClusterIP      10.96.0.1        <none>          443/TCP       5d6h
nginx-gateway  LoadBalancer   10.110.105.192   139.84.213.59   80:31512/TCP  91m
```

Now, visit your domain (or the LoadBalancer IP) in the browser.

![Screenshot 2025-08-25 at 4.12.15 AM.png](https://github.com/user-attachments/assets/cccc23cb-8db0-4302-bb07-86cae99484ba)
