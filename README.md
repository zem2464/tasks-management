
# ScriptAssist NestJS Exercise (Rough Notes)

## What was broken and what I did

- **N+1 queries everywhere:**
   - The code was hammering the DB with a ton of little queries for every user/task. I fixed it by making TypeORM grab related stuff in one go (relations, batch fetches). Now it’s not slow as molasses.

- **Batch ops were a mess:**
   - It was doing updates/deletes one by one, not even in a transaction. If something failed halfway, you’d get half-done data. I wrapped batch stuff in transactions and used bulk DB calls. Now it’s all-or-nothing.

- **Cache was just in-memory:**
   - Useless for real scaling. If you run two servers, they don’t share cache. I swapped it for Redis, so all instances see the same cache and it survives restarts.

- **No real rate limiting:**
   - The old rate limit was per instance, so you could just hit another server and spam. Now it’s Redis-backed, so it’s global.

- **Shared logic was copy-pasted:**
   - Stuff like cache and resilience was all over the place. I made a CommonModule and put shared services there. Less copy-paste, more DRY.

- **Security was weak:**
   - JWT was there but refresh tokens weren’t rotated, validation was spotty, config wasn’t secure. I added refresh token rotation, proper validation, and made sure secrets aren’t in code.

- **No resilience:**
   - If Redis or DB hiccuped, the app just died. I added retries and circuit breakers (cockatiel) so it can recover from blips.

- **Error handling/logging:**
   - Some errors just crashed the app or gave ugly messages. Now it uses NestJS exceptions and logs important stuff.

- **Endpoints:**
   - Some endpoints were missing or inconsistent. I made sure all the required ones are there and follow REST style. Filtering and pagination work too.

---

---

## Architectural Approach

- **Modular Design:** Used NestJS modules for clear separation of concerns (auth, users, tasks, common).
- **Shared Services:** Centralized distributed cache and resilience logic in `CommonModule`.
- **Distributed Caching:** Integrated Redis-backed cache for users and tasks, with cache invalidation on update/delete.
- **Resilience:** Added retry and circuit breaker logic using `cockatiel`.
- **Security:** JWT auth, input validation, rate limiting, refresh token rotation.
- **Performance:** Batched DB operations, fixed N+1 queries, optimized queries with pagination and filtering.

## Performance & Security Improvements

- **Performance:**
   - Bulk DB operations and query optimization
   - Redis distributed cache for hot data
   - Efficient pagination and filtering
- **Security:**
   - JWT authentication and refresh token rotation
   - Input validation and sanitization
   - Distributed rate limiting with Redis
   - Secure config management

## Key Technical Decisions & Rationale

- **TypeORM for DB access:** Chosen for its integration with NestJS and transaction support.
- **Redis for cache and rate limiting:** Enables horizontal scaling and fast lookups.
- **Cockatiel for resilience:** Provides robust retry/circuit breaker patterns.
- **CommonModule:** Centralizes shared logic, reducing duplication and improving maintainability.
- **Error handling:** Consistent use of NestJS exceptions and logging for observability.

## Tradeoffs

- **Complexity vs. Scalability:** Added complexity with distributed cache and resilience logic, but necessary for production-readiness.
- **Cache Invalidation:** Chose explicit invalidation on update/delete for consistency, at the cost of some extra logic.
- **Batch Operations:** Prioritized DB efficiency, but some endpoints may be less flexible for edge cases.

---

## API Endpoints

- **Auth:**  
   `POST /auth/login` — Authenticate a user  
   `POST /auth/register` — Register a new user
- **Tasks:**  
   `GET /tasks` — List tasks (filtering & pagination)  
   `GET /tasks/:id` — Get task details  
   `POST /tasks` — Create a new task  
   `PATCH /tasks/:id` — Update a task  
   `DELETE /tasks/:id` — Delete a task  
   `POST /tasks/batch` — Batch operations on tasks

---

## How to Run

1. Install dependencies:  
    ```sh
    bun install
    ```
2. Configure environment variables (see `ormconfig.example.json` and config files).
3. Start Redis and PostgreSQL.
4. Run the app:  
    ```sh
    bun run start
    ```
5. API docs available at `/api` (if Swagger enabled).

---

