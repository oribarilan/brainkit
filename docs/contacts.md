# Contacts

The contacts file is a people index at `03_resources/contacts.md`. It's a reference for remembering who people are, what they do, and how you know them. The use case is straightforward: the user mentions "Sarah" in a conversation, and the agent can look up that Sarah Chen is a Staff Engineer on the Platform team who they collaborated with on the API redesign. Without this file, the agent has no memory of people across sessions.

Contacts span professional and personal life. A colleague, a doctor, a neighbor, a financial advisor, a kid's teacher — anyone worth remembering goes here. A person can occupy multiple roles (colleague and friend, for instance), and that's fine.

## Behavior

### File format

The contacts file uses H2 headings for each person, with the person's full name as the heading text. Below the heading, structured fields describe the person. The file starts with a top-level `# Contacts` heading.

```markdown
# Contacts

## Sarah Chen

- **Role**: Staff Engineer
- **Team**: Platform
- **Relation**: Direct collaborator on API redesign
- **Connection**: Met during 2025 architecture summit
- **Relevant For**: API design, distributed systems, Rust

## Marcus Johnson

- **Role**: Engineering Manager
- **Team**: Security
- **Relation**: Skip-level manager

## Dr. Emily Park

- **Role**: Family Doctor
- **Relation**: Primary care physician since 2023
- **Relevant For**: Annual checkups, referrals
```

The only required piece of information is the name (the H2 heading itself). All fields below it are optional. The recognized fields are:

- **Role** — what the person does (job title, profession, or general descriptor)
- **Team** — organizational unit, department, or group
- **Relation** — how the user knows this person or what their relationship is
- **Connection** — context for how they met or started interacting
- **Relevant For** — topics, skills, or situations where this person is useful to remember
- **Alias** — nicknames or shortened names, comma-separated (e.g., `SJ, Sarah`)

Fields follow the format `- **Field**: value`. The parser matches this pattern with a case-insensitive key lookup, so `- **role**: Engineer` and `- **Role**: Engineer` both work, though the convention is to capitalize field names.

### Adding contacts

The agent never adds someone to the contacts file without asking first. When a new person comes up in conversation — a colleague mentioned for the first time, an attendee in meeting notes, a contractor the user hired — the agent offers with something like "Want me to add them to your contacts?" If the user says yes, the agent collects whatever information is available and appends a new section to the file.

The `addContact()` function handles the file-level mechanics: it reads the existing content, ensures proper spacing (double newline between entries), formats the new contact section with whatever fields are provided, and writes it back.

### Searching contacts

The `searchContacts()` function does a case-insensitive substring match against all fields on every contact: name, alias, role, team, relation, connection, and relevantFor. If the query string appears anywhere in any of those fields, the contact is a match. This is intentionally simple — no fuzzy matching or scoring, just substring inclusion. A search for "platform" returns anyone with "Platform" in their team, role, or any other field.

The `parseContacts()` function handles deserialization: it splits the file content on `## ` boundaries, extracts the name from the first line of each section, and parses the field lines using a regex that matches `- **Key**: value`. Unrecognized field names are silently ignored.

### Cross-referencing

The contacts file is most useful when the agent proactively connects it to ongoing conversations. The skill instructions in the system prompt tell the agent to check contacts in several situations:

- When the user mentions someone by name, the agent checks whether that person is in the contacts file and can pull up context about them.
- When creating meeting notes, the agent links attendees to their contact entries when they exist.
- When discussing a project, the agent can surface relevant contacts — people whose "Relevant For" field overlaps with the project's domain.
- In personal contexts too: doctor appointments, school meetings, contractor discussions.

This cross-referencing is agent-driven, not automated. The agent reads the file and makes connections based on the skill instructions baked into the system prompt. There's no background process scanning for name matches.

### Personal contacts

The contacts file isn't limited to professional relationships. A neighbor, a contractor who did the kitchen remodel, a kid's teacher, a financial advisor, the family doctor — all of these are valid entries. The same fields work: Role can be "Pediatrician" or "General Contractor," Relation can be "Neighbor since 2022" or "Kids' math teacher." The vault doesn't enforce a boundary between personal and professional, and neither does the contacts file.

## Harness implementation

| Capability | OpenCode | Copilot CLI |
|---|---|---|
| Adding contacts | Agent uses built-in file editing, guided by the contacts skill for format | Agent uses built-in file editing, guided by contacts skill in `.agents/skills/brainkit/references/contacts.md` |
| Searching contacts | Agent reads the contacts file and searches manually; `parseContacts()` and `searchContacts()` are available in core but used by the sidebar, not directly by the agent | Agent reads the contacts file and searches manually, guided by skill instructions |
| Cross-referencing | Agent checks contacts when people are mentioned, guided by skill instructions in the system prompt | Agent checks contacts when people are mentioned, guided by skill instructions in AGENTS.md |
| Contact count in sidebar | TUI sidebar component reads and parses contacts, displays total count | `statusLine` script shows contact count in Copilot's footer bar |
