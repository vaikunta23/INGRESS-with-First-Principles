import { useEffect, useState } from "react";

function App() {
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Call backend via nginx (/api → backend service)
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      console.error("Error fetching users:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to add user");
      const newUser = await res.json();
      setUsers((prev) => [...prev, newUser]);
      setName("");
    } catch (e) {
      console.error("Error adding user:", e);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto" }}>
      <h2>Users</h2>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <ul>
          {users.map((user) => (
            <li key={user.id}>{user.name}</li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAddUser} style={{ marginTop: 20 }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter name"
        />
        <button type="submit" style={{ marginLeft: 8 }}>
          Add User
        </button>
      </form>
    </div>
  );
}

export default App;
