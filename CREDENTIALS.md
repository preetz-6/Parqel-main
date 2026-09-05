# Parqel — Dev Login Credentials

All seed accounts use the same default password: **`parqel123`**

| Employee ID | Name               | Role(s)         | Department       | Type       |
|-------------|--------------------|-----------------|------------------|------------|
| `ADM001`    | Priya Nair         | Admin           | IT               | Staff      |
| `EMP001`    | Priya Nair         | Employee        | IT               | Staff      |
| `PRK001`    | Rakesh Iyer        | Supervisor      | Facilities       | Staff      |
| `SEC001`    | Anand Rao          | Supervisor      | Security         | Staff      |
| `SEC002`    | Lakshmi Devi       | Guard (scoped)  | Security         | Contractor |
| `FAC101`    | Dr. Meera Krishnan | Employee        | Computer Science | Faculty    |
| `STU2201`   | Arjun Menon        | Employee        | Computer Science | Student    |

> After seeding (`npm run db:seed`), all accounts are set with password `parqel123`.
>
> PRK001 and SEC001 are both Supervisors on different shifts — this satisfies
> Rule 2 (impartial appeal review) without requiring Admin escalation.
