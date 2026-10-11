// Creates or resets a Liquidation Hub operator.
//   node create-user.js ops@vrymnox.com "Ops Lead" admin
// The password is read from HUB_PASSWORD or prompted for (not echoed), so it never lands in shell history.
import pkg from "pg";
import dotenv from "dotenv";
import { createInterface } from "node:readline";
import { hashPassword } from "./auth.js";

const { Pool } = pkg;
dotenv.config();

const [email, displayName = null, role = "operator"] = process.argv.slice(2);
if (!email || !["operator", "admin"].includes(role)) {
  console.error('Usage: node create-user.js <email> ["Display Name"] [operator|admin]');
  process.exit(1);
}

function promptHidden(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => {
    if (s.includes(question)) rl.output.write(s);
  };
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    }),
  );
}

const password = process.env.HUB_PASSWORD ?? (await promptHidden("Password (min 12 chars): "));
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const { rows } = await pool.query(
    `INSERT INTO hub_users (email, display_name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (lower(email)) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, display_name = EXCLUDED.display_name, role = EXCLUDED.role
     RETURNING user_id, email, role`,
    [email.trim().toLowerCase(), displayName, await hashPassword(password), role],
  );
  // A reset password should end every existing session for that user.
  await pool.query("DELETE FROM hub_sessions WHERE user_id = $1", [rows[0].user_id]);
  console.log(`Saved ${rows[0].email} (${rows[0].role}), user_id ${rows[0].user_id}`);
} finally {
  await pool.end();
}
