"use strict";var Yt=Object.create;var X=Object.defineProperty;var Jt=Object.getOwnPropertyDescriptor;var zt=Object.getOwnPropertyNames;var Qt=Object.getPrototypeOf,Zt=Object.prototype.hasOwnProperty;var es=(r,e)=>{for(var t in e)X(r,t,{get:e[t],enumerable:!0})},Ie=(r,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of zt(e))!Zt.call(r,n)&&n!==t&&X(r,n,{get:()=>e[n],enumerable:!(s=Jt(e,n))||s.enumerable});return r};var y=(r,e,t)=>(t=r!=null?Yt(Qt(r)):{},Ie(e||!r||!r.__esModule?X(t,"default",{value:r,enumerable:!0}):t,r)),ts=r=>Ie(X({},"__esModule",{value:!0}),r);var cr={};es(cr,{generateContext:()=>Re});module.exports=ts(cr);var qt=y(require("path"),1),Kt=require("os"),Vt=require("fs");var ae=require("bun:sqlite");var b=require("path"),re=require("os"),j=require("fs");var ve=require("url");var I=require("fs"),U=require("path"),ye=require("os"),te=(o=>(o[o.DEBUG=0]="DEBUG",o[o.INFO=1]="INFO",o[o.WARN=2]="WARN",o[o.ERROR=3]="ERROR",o[o.SILENT=4]="SILENT",o))(te||{}),Le=(0,U.join)((0,ye.homedir)(),".claude-mem"),se=class{level=null;useColor;logFilePath=null;logFileInitialized=!1;constructor(){this.useColor=process.stdout.isTTY??!1}ensureLogFileInitialized(){if(!this.logFileInitialized){this.logFileInitialized=!0;try{let e=(0,U.join)(Le,"logs");(0,I.existsSync)(e)||(0,I.mkdirSync)(e,{recursive:!0});let t=new Date().toISOString().split("T")[0];this.logFilePath=(0,U.join)(e,`claude-mem-${t}.log`)}catch(e){console.error("[LOGGER] Failed to initialize log file:",e instanceof Error?e.message:String(e)),this.logFilePath=null}}}getLevel(){if(this.level===null)try{let e=(0,U.join)(Le,"settings.json");if((0,I.existsSync)(e)){let t=(0,I.readFileSync)(e,"utf-8"),n=(JSON.parse(t).CLAUDE_MEM_LOG_LEVEL||"INFO").toUpperCase();this.level=te[n]??1}else this.level=1}catch(e){console.error("[LOGGER] Failed to load log level from settings:",e instanceof Error?e.message:String(e)),this.level=1}return this.level}correlationId(e,t){return`obs-${e}-${t}`}sessionId(e){return`session-${e}`}formatData(e){if(e==null)return"";if(typeof e=="string")return e;if(typeof e=="number"||typeof e=="boolean")return e.toString();if(typeof e=="object"){if(e instanceof Error)return this.getLevel()===0?`${e.message}
${e.stack}`:e.message;if(Array.isArray(e))return`[${e.length} items]`;let t=Object.keys(e);return t.length===0?"{}":t.length<=3?JSON.stringify(e):`{${t.length} keys: ${t.slice(0,3).join(", ")}...}`}return String(e)}formatTool(e,t){if(!t)return e;let s=t;if(typeof t=="string")try{s=JSON.parse(t)}catch{s=t}if(e==="Bash"&&s.command)return`${e}(${s.command})`;if(s.file_path)return`${e}(${s.file_path})`;if(s.notebook_path)return`${e}(${s.notebook_path})`;if(e==="Glob"&&s.pattern)return`${e}(${s.pattern})`;if(e==="Grep"&&s.pattern)return`${e}(${s.pattern})`;if(s.url)return`${e}(${s.url})`;if(s.query)return`${e}(${s.query})`;if(e==="Task"){if(s.subagent_type)return`${e}(${s.subagent_type})`;if(s.description)return`${e}(${s.description})`}return e==="Skill"&&s.skill?`${e}(${s.skill})`:e==="LSP"&&s.operation?`${e}(${s.operation})`:e}formatTimestamp(e){let t=e.getFullYear(),s=String(e.getMonth()+1).padStart(2,"0"),n=String(e.getDate()).padStart(2,"0"),o=String(e.getHours()).padStart(2,"0"),i=String(e.getMinutes()).padStart(2,"0"),a=String(e.getSeconds()).padStart(2,"0"),d=String(e.getMilliseconds()).padStart(3,"0");return`${t}-${s}-${n} ${o}:${i}:${a}.${d}`}log(e,t,s,n,o){if(e<this.getLevel())return;this.ensureLogFileInitialized();let i=this.formatTimestamp(new Date),a=te[e].padEnd(5),d=t.padEnd(6),u="";n?.correlationId?u=`[${n.correlationId}] `:n?.sessionId&&(u=`[session-${n.sessionId}] `);let c="";o!=null&&(o instanceof Error?c=this.getLevel()===0?`
${o.message}
${o.stack}`:` ${o.message}`:this.getLevel()===0&&typeof o=="object"?c=`
`+JSON.stringify(o,null,2):c=" "+this.formatData(o));let _="";if(n){let{sessionId:g,memorySessionId:h,correlationId:C,...E}=n;Object.keys(E).length>0&&(_=` {${Object.entries(E).map(([T,f])=>`${T}=${f}`).join(", ")}}`)}let p=`[${i}] [${a}] [${d}] ${u}${s}${_}${c}`;if(this.logFilePath)try{(0,I.appendFileSync)(this.logFilePath,p+`
`,"utf8")}catch(g){process.stderr.write(`[LOGGER] Failed to write to log file: ${g instanceof Error?g.message:String(g)}
`)}else process.stderr.write(p+`
`)}debug(e,t,s,n){this.log(0,e,t,s,n)}info(e,t,s,n){this.log(1,e,t,s,n)}warn(e,t,s,n){this.log(2,e,t,s,n)}error(e,t,s,n){this.log(3,e,t,s,n)}dataIn(e,t,s,n){this.info(e,`\u2192 ${t}`,s,n)}dataOut(e,t,s,n){this.info(e,`\u2190 ${t}`,s,n)}success(e,t,s,n){this.info(e,`\u2713 ${t}`,s,n)}failure(e,t,s,n){this.error(e,`\u2717 ${t}`,s,n)}timing(e,t,s,n){this.info(e,`\u23F1 ${t}`,n,{duration:`${s}ms`})}happyPathError(e,t,s,n,o=""){let u=((new Error().stack||"").split(`
`)[2]||"").match(/at\s+(?:.*\s+)?\(?([^:]+):(\d+):(\d+)\)?/),c=u?`${u[1].split("/").pop()}:${u[2]}`:"unknown",_={...s,location:c};return this.warn(e,`[HAPPY-PATH] ${t}`,_,n),o}},m=new se;var is={};function ss(){return typeof __dirname<"u"?__dirname:(0,b.dirname)((0,ve.fileURLToPath)(is.url))}var rs=ss();function ns(){if(process.env.CLAUDE_MEM_DATA_DIR)return process.env.CLAUDE_MEM_DATA_DIR;let r=(0,b.join)((0,re.homedir)(),".claude-mem"),e=(0,b.join)(r,"settings.json");try{if((0,j.existsSync)(e)){let{readFileSync:t}=require("fs"),s=JSON.parse(t(e,"utf-8")),n=s.env??s;if(n.CLAUDE_MEM_DATA_DIR)return n.CLAUDE_MEM_DATA_DIR}}catch{}return r}var R=ns(),v=process.env.CLAUDE_CONFIG_DIR||(0,b.join)((0,re.homedir)(),".claude"),pr=(0,b.join)(v,"plugins","marketplaces","thedotmack"),Er=(0,b.join)(R,"archives"),gr=(0,b.join)(R,"logs"),Tr=(0,b.join)(R,"trash"),fr=(0,b.join)(R,"backups"),br=(0,b.join)(R,"modes"),Sr=(0,b.join)(R,"settings.json"),hr=(0,b.join)(R,"auth.token"),Or=(0,b.join)(R,"outbox.jsonl"),Ar=(0,b.join)(R,"file-context-events.jsonl"),Me=(0,b.join)(R,"claude-mem.db"),Rr=(0,b.join)(R,"vector-db"),os=(0,b.join)(R,"observer-sessions"),ne=(0,b.basename)(os),Cr=(0,b.join)(v,"settings.json"),Nr=(0,b.join)(v,"commands"),Ir=(0,b.join)(v,"CLAUDE.md");function De(r){(0,j.mkdirSync)(r,{recursive:!0})}function xe(){return(0,b.join)(rs,"..")}var Fe=require("crypto");var we=require("os"),ke=y(require("path"),1);var W=require("fs"),B=y(require("path"),1),w={isWorktree:!1,worktreeName:null,parentRepoPath:null,parentProjectName:null};function Ue(r){let e=B.default.join(r,".git"),t;try{t=(0,W.statSync)(e)}catch(c){return c instanceof Error&&c.code!=="ENOENT"&&console.warn("[worktree] Unexpected error checking .git:",c),w}if(!t.isFile())return w;let s;try{s=(0,W.readFileSync)(e,"utf-8").trim()}catch(c){return console.warn("[worktree] Failed to read .git file:",c instanceof Error?c.message:String(c)),w}let n=s.match(/^gitdir:\s*(.+)$/);if(!n)return w;let i=n[1].match(/^(.+)[/\\]\.git[/\\]worktrees[/\\]([^/\\]+)$/);if(!i)return w;let a=i[1],d=B.default.basename(r),u=B.default.basename(a);return{isWorktree:!0,worktreeName:d,parentRepoPath:a,parentProjectName:u}}function $e(r){return r==="~"||r.startsWith("~/")?r.replace(/^~/,(0,we.homedir)()):r}function as(r){if(!r||r.trim()==="")return m.warn("PROJECT_NAME","Empty cwd provided, using fallback",{cwd:r}),"unknown-project";let e=$e(r),t=ke.default.basename(e);if(t===""){if(process.platform==="win32"){let n=r.match(/^([A-Z]):\\/i);if(n){let i=`drive-${n[1].toUpperCase()}`;return m.info("PROJECT_NAME","Drive root detected",{cwd:r,projectName:i}),i}}return m.warn("PROJECT_NAME","Root directory detected, using fallback",{cwd:r}),"unknown-project"}return t}function oe(r){let e=as(r);if(!r)return{primary:e,parent:null,isWorktree:!1,allProjects:[e]};let t=$e(r),s=Ue(t);if(s.isWorktree&&s.parentProjectName){let n=`${s.parentProjectName}/${e}`;return{primary:n,parent:s.parentProjectName,isWorktree:!0,allProjects:[s.parentProjectName,n]}}return{primary:e,parent:null,isWorktree:!1,allProjects:[e]}}function q(r,e,t){return(0,Fe.createHash)("sha256").update([r||"",e||"",t||""].join("\0")).digest("hex").slice(0,16)}function ie(r){if(!r)return[];try{let e=JSON.parse(r);return Array.isArray(e)?e:[String(e)]}catch{return[r]}}var O="claude";function ds(r){return r.trim().toLowerCase().replace(/\s+/g,"-")}function M(r){if(!r)return O;let e=ds(r);return e?e==="transcript"||e.includes("codex")?"codex":e.includes("cursor")?"cursor":e.includes("claude")?"claude":e:O}function Pe(r){let e=["claude","codex","cursor"];return[...r].sort((t,s)=>{let n=e.indexOf(t),o=e.indexOf(s);return n!==-1||o!==-1?n===-1?1:o===-1?-1:n-o:t.localeCompare(s)})}function cs(r,e){return{customTitle:r,platformSource:e?M(e):void 0}}var K=class{db;constructor(e=Me){e instanceof ae.Database?this.db=e:(e!==":memory:"&&De(R),this.db=new ae.Database(e),this.db.run("PRAGMA journal_mode = WAL"),this.db.run("PRAGMA synchronous = NORMAL"),this.db.run("PRAGMA foreign_keys = ON"),this.db.run("PRAGMA journal_size_limit = 4194304")),this.initializeSchema(),this.ensureWorkerPortColumn(),this.ensurePromptTrackingColumns(),this.removeSessionSummariesUniqueConstraint(),this.addObservationHierarchicalFields(),this.makeObservationsTextNullable(),this.createUserPromptsTable(),this.ensureDiscoveryTokensColumn(),this.createPendingMessagesTable(),this.renameSessionIdColumns(),this.repairSessionIdColumnRename(),this.addFailedAtEpochColumn(),this.addOnUpdateCascadeToForeignKeys(),this.addObservationContentHashColumn(),this.addSessionCustomTitleColumn(),this.addSessionPlatformSourceColumn(),this.addObservationModelColumns(),this.ensureMergedIntoProjectColumns(),this.addObservationSubagentColumns(),this.addObservationStalenessColumns(),this.addObservationsUniqueContentHashIndex(),this.addObservationRawTypeColumn()}initializeSchema(){this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `),this.db.run(`
      CREATE TABLE IF NOT EXISTS sdk_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT UNIQUE NOT NULL,
        memory_session_id TEXT UNIQUE,
        project TEXT NOT NULL,
        platform_source TEXT NOT NULL DEFAULT 'claude',
        user_prompt TEXT,
        started_at TEXT NOT NULL,
        started_at_epoch INTEGER NOT NULL,
        completed_at TEXT,
        completed_at_epoch INTEGER,
        status TEXT CHECK(status IN ('active', 'completed', 'failed')) NOT NULL DEFAULT 'active'
      );

      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_claude_id ON sdk_sessions(content_session_id);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_sdk_id ON sdk_sessions(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_project ON sdk_sessions(project);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_status ON sdk_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sdk_sessions_started ON sdk_sessions(started_at_epoch DESC);

      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project);
      CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
      CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at_epoch DESC);

      CREATE TABLE IF NOT EXISTS session_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT UNIQUE NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(4,new Date().toISOString())}ensureWorkerPortColumn(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(s=>s.name==="worker_port")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN worker_port INTEGER"),m.debug("DB","Added worker_port column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(5,new Date().toISOString())}ensurePromptTrackingColumns(){this.db.query("PRAGMA table_info(sdk_sessions)").all().some(a=>a.name==="prompt_counter")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN prompt_counter INTEGER DEFAULT 0"),m.debug("DB","Added prompt_counter column to sdk_sessions table")),this.db.query("PRAGMA table_info(observations)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE observations ADD COLUMN prompt_number INTEGER"),m.debug("DB","Added prompt_number column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(a=>a.name==="prompt_number")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN prompt_number INTEGER"),m.debug("DB","Added prompt_number column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(6,new Date().toISOString())}removeSessionSummariesUniqueConstraint(){if(!this.db.query("PRAGMA index_list(session_summaries)").all().some(s=>s.unique===1&&s.origin!=="pk")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString());return}m.debug("DB","Removing UNIQUE constraint from session_summaries.memory_session_id"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS session_summaries_new"),this.db.run(`
      CREATE TABLE session_summaries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        prompt_number INTEGER,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      )
    `),this.db.run(`
      INSERT INTO session_summaries_new
      SELECT id, memory_session_id, project, request, investigated, learned,
             completed, next_steps, files_read, files_edited, notes,
             prompt_number, created_at, created_at_epoch
      FROM session_summaries
    `),this.db.run("DROP TABLE session_summaries"),this.db.run("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.run(`
      CREATE INDEX idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(7,new Date().toISOString()),m.debug("DB","Successfully removed UNIQUE constraint from session_summaries.memory_session_id")}addObservationHierarchicalFields(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(8))return;if(this.db.query("PRAGMA table_info(observations)").all().some(n=>n.name==="title")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString());return}m.debug("DB","Adding hierarchical fields to observations table"),this.db.run(`
      ALTER TABLE observations ADD COLUMN title TEXT;
      ALTER TABLE observations ADD COLUMN subtitle TEXT;
      ALTER TABLE observations ADD COLUMN facts TEXT;
      ALTER TABLE observations ADD COLUMN narrative TEXT;
      ALTER TABLE observations ADD COLUMN concepts TEXT;
      ALTER TABLE observations ADD COLUMN files_read TEXT;
      ALTER TABLE observations ADD COLUMN files_modified TEXT;
    `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(8,new Date().toISOString()),m.debug("DB","Successfully added hierarchical fields to observations table")}makeObservationsTextNullable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(9))return;let s=this.db.query("PRAGMA table_info(observations)").all().find(n=>n.name==="text");if(!s||s.notnull===0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString());return}m.debug("DB","Making observations.text nullable"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TABLE IF EXISTS observations_new"),this.db.run(`
      CREATE TABLE observations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT,
        type TEXT NOT NULL,
        title TEXT,
        subtitle TEXT,
        facts TEXT,
        narrative TEXT,
        concepts TEXT,
        files_read TEXT,
        files_modified TEXT,
        prompt_number INTEGER,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE
      )
    `),this.db.run(`
      INSERT INTO observations_new
      SELECT id, memory_session_id, project, text, type, title, subtitle, facts,
             narrative, concepts, files_read, files_modified, prompt_number,
             created_at, created_at_epoch
      FROM observations
    `),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(`
      CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX idx_observations_project ON observations(project);
      CREATE INDEX idx_observations_type ON observations(type);
      CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
    `),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(9,new Date().toISOString()),m.debug("DB","Successfully made observations.text nullable")}createUserPromptsTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(10))return;if(this.db.query("PRAGMA table_info(user_prompts)").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString());return}m.debug("DB","Creating user_prompts table with FTS5 support"),this.db.run("BEGIN TRANSACTION"),this.db.run(`
      CREATE TABLE user_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT NOT NULL,
        prompt_number INTEGER NOT NULL,
        prompt_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(content_session_id) REFERENCES sdk_sessions(content_session_id) ON DELETE CASCADE
      );

      CREATE INDEX idx_user_prompts_claude_session ON user_prompts(content_session_id);
      CREATE INDEX idx_user_prompts_created ON user_prompts(created_at_epoch DESC);
      CREATE INDEX idx_user_prompts_prompt_number ON user_prompts(prompt_number);
      CREATE INDEX idx_user_prompts_lookup ON user_prompts(content_session_id, prompt_number);
    `);let s=`
      CREATE VIRTUAL TABLE user_prompts_fts USING fts5(
        prompt_text,
        content='user_prompts',
        content_rowid='id'
      );
    `,n=`
      CREATE TRIGGER user_prompts_ai AFTER INSERT ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(rowid, prompt_text)
        VALUES (new.id, new.prompt_text);
      END;

      CREATE TRIGGER user_prompts_ad AFTER DELETE ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
        VALUES('delete', old.id, old.prompt_text);
      END;

      CREATE TRIGGER user_prompts_au AFTER UPDATE ON user_prompts BEGIN
        INSERT INTO user_prompts_fts(user_prompts_fts, rowid, prompt_text)
        VALUES('delete', old.id, old.prompt_text);
        INSERT INTO user_prompts_fts(rowid, prompt_text)
        VALUES (new.id, new.prompt_text);
      END;
    `;try{this.db.run(s),this.db.run(n)}catch(o){o instanceof Error?m.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},o):m.warn("DB","FTS5 not available \u2014 user_prompts_fts skipped (search uses ChromaDB)",{},new Error(String(o))),this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),m.debug("DB","Created user_prompts table (without FTS5)");return}this.db.run("COMMIT"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(10,new Date().toISOString()),m.debug("DB","Successfully created user_prompts table")}ensureDiscoveryTokensColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(11))return;this.db.query("PRAGMA table_info(observations)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),m.debug("DB","Added discovery_tokens column to observations table")),this.db.query("PRAGMA table_info(session_summaries)").all().some(i=>i.name==="discovery_tokens")||(this.db.run("ALTER TABLE session_summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0"),m.debug("DB","Added discovery_tokens column to session_summaries table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(11,new Date().toISOString())}createPendingMessagesTable(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(16))return;if(this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_messages'").all().length>0){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString());return}m.debug("DB","Creating pending_messages table"),this.db.run(`
      CREATE TABLE pending_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_db_id INTEGER NOT NULL,
        content_session_id TEXT NOT NULL,
        message_type TEXT NOT NULL CHECK(message_type IN ('observation', 'summarize')),
        tool_name TEXT,
        tool_input TEXT,
        tool_response TEXT,
        cwd TEXT,
        last_user_message TEXT,
        last_assistant_message TEXT,
        prompt_number INTEGER,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'processed', 'failed')),
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at_epoch INTEGER NOT NULL,
        completed_at_epoch INTEGER,
        FOREIGN KEY (session_db_id) REFERENCES sdk_sessions(id) ON DELETE CASCADE
      )
    `),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_session ON pending_messages(session_db_id)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_status ON pending_messages(status)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_pending_messages_claude_session ON pending_messages(content_session_id)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(16,new Date().toISOString()),m.debug("DB","pending_messages table created successfully")}renameSessionIdColumns(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(17))return;m.debug("DB","Checking session ID columns for semantic clarity rename");let t=0,s=(n,o,i)=>{let a=this.db.query(`PRAGMA table_info(${n})`).all(),d=a.some(c=>c.name===o);return a.some(c=>c.name===i)?!1:d?(this.db.run(`ALTER TABLE ${n} RENAME COLUMN ${o} TO ${i}`),m.debug("DB",`Renamed ${n}.${o} to ${i}`),!0):(m.warn("DB",`Column ${o} not found in ${n}, skipping rename`),!1)};s("sdk_sessions","claude_session_id","content_session_id")&&t++,s("sdk_sessions","sdk_session_id","memory_session_id")&&t++,s("pending_messages","claude_session_id","content_session_id")&&t++,s("observations","sdk_session_id","memory_session_id")&&t++,s("session_summaries","sdk_session_id","memory_session_id")&&t++,s("user_prompts","claude_session_id","content_session_id")&&t++,this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(17,new Date().toISOString()),t>0?m.debug("DB",`Successfully renamed ${t} session ID columns`):m.debug("DB","No session ID column renames needed (already up to date)")}repairSessionIdColumnRename(){this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(19)||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(19,new Date().toISOString())}addFailedAtEpochColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(20))return;this.db.query("PRAGMA table_info(pending_messages)").all().some(n=>n.name==="failed_at_epoch")||(this.db.run("ALTER TABLE pending_messages ADD COLUMN failed_at_epoch INTEGER"),m.debug("DB","Added failed_at_epoch column to pending_messages table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(20,new Date().toISOString())}addOnUpdateCascadeToForeignKeys(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(21))return;m.debug("DB","Adding ON UPDATE CASCADE to FK constraints on observations and session_summaries"),this.db.run("PRAGMA foreign_keys = OFF"),this.db.run("BEGIN TRANSACTION"),this.db.run("DROP TRIGGER IF EXISTS observations_ai"),this.db.run("DROP TRIGGER IF EXISTS observations_ad"),this.db.run("DROP TRIGGER IF EXISTS observations_au"),this.db.run("DROP TABLE IF EXISTS observations_new");let t=`
      CREATE TABLE observations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        text TEXT,
        type TEXT NOT NULL,
        title TEXT,
        subtitle TEXT,
        facts TEXT,
        narrative TEXT,
        concepts TEXT,
        files_read TEXT,
        files_modified TEXT,
        prompt_number INTEGER,
        discovery_tokens INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `,s=`
      INSERT INTO observations_new
      SELECT id, memory_session_id, project, text, type, title, subtitle, facts,
             narrative, concepts, files_read, files_modified, prompt_number,
             discovery_tokens, created_at, created_at_epoch
      FROM observations
    `,n=`
      CREATE INDEX idx_observations_sdk_session ON observations(memory_session_id);
      CREATE INDEX idx_observations_project ON observations(project);
      CREATE INDEX idx_observations_type ON observations(type);
      CREATE INDEX idx_observations_created ON observations(created_at_epoch DESC);
    `,o=`
      CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
        INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
      END;

      CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
      END;

      CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
        INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
        INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
        VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
      END;
    `;this.db.run("DROP TRIGGER IF EXISTS session_summaries_ai"),this.db.run("DROP TRIGGER IF EXISTS session_summaries_ad"),this.db.run("DROP TRIGGER IF EXISTS session_summaries_au"),this.db.run("DROP TABLE IF EXISTS session_summaries_new");let i=`
      CREATE TABLE session_summaries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_session_id TEXT NOT NULL,
        project TEXT NOT NULL,
        request TEXT,
        investigated TEXT,
        learned TEXT,
        completed TEXT,
        next_steps TEXT,
        files_read TEXT,
        files_edited TEXT,
        notes TEXT,
        prompt_number INTEGER,
        discovery_tokens INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `,a=`
      INSERT INTO session_summaries_new
      SELECT id, memory_session_id, project, request, investigated, learned,
             completed, next_steps, files_read, files_edited, notes,
             prompt_number, discovery_tokens, created_at, created_at_epoch
      FROM session_summaries
    `,d=`
      CREATE INDEX idx_session_summaries_sdk_session ON session_summaries(memory_session_id);
      CREATE INDEX idx_session_summaries_project ON session_summaries(project);
      CREATE INDEX idx_session_summaries_created ON session_summaries(created_at_epoch DESC);
    `,u=`
      CREATE TRIGGER IF NOT EXISTS session_summaries_ai AFTER INSERT ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
      END;

      CREATE TRIGGER IF NOT EXISTS session_summaries_ad AFTER DELETE ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
      END;

      CREATE TRIGGER IF NOT EXISTS session_summaries_au AFTER UPDATE ON session_summaries BEGIN
        INSERT INTO session_summaries_fts(session_summaries_fts, rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES('delete', old.id, old.request, old.investigated, old.learned, old.completed, old.next_steps, old.notes);
        INSERT INTO session_summaries_fts(rowid, request, investigated, learned, completed, next_steps, notes)
        VALUES (new.id, new.request, new.investigated, new.learned, new.completed, new.next_steps, new.notes);
      END;
    `;try{this.recreateObservationsWithCascade(t,s,n,o),this.recreateSessionSummariesWithCascade(i,a,d,u),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(21,new Date().toISOString()),this.db.run("COMMIT"),this.db.run("PRAGMA foreign_keys = ON"),m.debug("DB","Successfully added ON UPDATE CASCADE to FK constraints")}catch(c){throw this.db.run("ROLLBACK"),this.db.run("PRAGMA foreign_keys = ON"),c instanceof Error?c:new Error(String(c))}}recreateObservationsWithCascade(e,t,s,n){this.db.run(e),this.db.run(t),this.db.run("DROP TABLE observations"),this.db.run("ALTER TABLE observations_new RENAME TO observations"),this.db.run(s),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'").all().length>0&&this.db.run(n)}recreateSessionSummariesWithCascade(e,t,s,n){this.db.run(e),this.db.run(t),this.db.run("DROP TABLE session_summaries"),this.db.run("ALTER TABLE session_summaries_new RENAME TO session_summaries"),this.db.run(s),this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_summaries_fts'").all().length>0&&this.db.run(n)}addObservationContentHashColumn(){if(this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="content_hash")){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString());return}this.db.run("ALTER TABLE observations ADD COLUMN content_hash TEXT"),this.db.run("UPDATE observations SET content_hash = substr(hex(randomblob(8)), 1, 16) WHERE content_hash IS NULL"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_content_hash ON observations(content_hash, created_at_epoch)"),m.debug("DB","Added content_hash column to observations table with backfill and index"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(22,new Date().toISOString())}addSessionCustomTitleColumn(){if(this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(23))return;this.db.query("PRAGMA table_info(sdk_sessions)").all().some(n=>n.name==="custom_title")||(this.db.run("ALTER TABLE sdk_sessions ADD COLUMN custom_title TEXT"),m.debug("DB","Added custom_title column to sdk_sessions table")),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(23,new Date().toISOString())}addSessionPlatformSourceColumn(){let t=this.db.query("PRAGMA table_info(sdk_sessions)").all().some(i=>i.name==="platform_source"),n=this.db.query("PRAGMA index_list(sdk_sessions)").all().some(i=>i.name==="idx_sdk_sessions_platform_source");this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(24)&&t&&n||(t||(this.db.run(`ALTER TABLE sdk_sessions ADD COLUMN platform_source TEXT NOT NULL DEFAULT '${O}'`),m.debug("DB","Added platform_source column to sdk_sessions table")),this.db.run(`
      UPDATE sdk_sessions
      SET platform_source = '${O}'
      WHERE platform_source IS NULL OR platform_source = ''
    `),n||this.db.run("CREATE INDEX IF NOT EXISTS idx_sdk_sessions_platform_source ON sdk_sessions(platform_source)"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(24,new Date().toISOString()))}addObservationModelColumns(){let e=this.db.query("PRAGMA table_info(observations)").all(),t=e.some(n=>n.name==="generated_by_model"),s=e.some(n=>n.name==="relevance_count");t&&s||(t||this.db.run("ALTER TABLE observations ADD COLUMN generated_by_model TEXT"),s||this.db.run("ALTER TABLE observations ADD COLUMN relevance_count INTEGER DEFAULT 0"),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(26,new Date().toISOString()))}ensureMergedIntoProjectColumns(){this.db.query("PRAGMA table_info(observations)").all().some(s=>s.name==="merged_into_project")||this.db.run("ALTER TABLE observations ADD COLUMN merged_into_project TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_merged_into ON observations(merged_into_project)"),this.db.query("PRAGMA table_info(session_summaries)").all().some(s=>s.name==="merged_into_project")||this.db.run("ALTER TABLE session_summaries ADD COLUMN merged_into_project TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_summaries_merged_into ON session_summaries(merged_into_project)")}addObservationSubagentColumns(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(27),t=this.db.query("PRAGMA table_info(observations)").all(),s=t.some(i=>i.name==="agent_type"),n=t.some(i=>i.name==="agent_id");s||this.db.run("ALTER TABLE observations ADD COLUMN agent_type TEXT"),n||this.db.run("ALTER TABLE observations ADD COLUMN agent_id TEXT"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_agent_type ON observations(agent_type)"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_agent_id ON observations(agent_id)");let o=this.db.query("PRAGMA table_info(pending_messages)").all();if(o.length>0){let i=o.some(d=>d.name==="agent_type"),a=o.some(d=>d.name==="agent_id");i||this.db.run("ALTER TABLE pending_messages ADD COLUMN agent_type TEXT"),a||this.db.run("ALTER TABLE pending_messages ADD COLUMN agent_id TEXT")}e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(27,new Date().toISOString())}addObservationStalenessColumns(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(28),t=this.db.query("PRAGMA table_info(observations)").all(),s=t.some(o=>o.name==="verified_at"),n=t.some(o=>o.name==="stale");s||this.db.run("ALTER TABLE observations ADD COLUMN verified_at INTEGER DEFAULT NULL"),n||this.db.run("ALTER TABLE observations ADD COLUMN stale INTEGER DEFAULT 0"),this.db.run("CREATE INDEX IF NOT EXISTS idx_observations_stale ON observations(stale)"),e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(28,new Date().toISOString())}addObservationsUniqueContentHashIndex(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(29),t=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='ux_observations_session_hash'").get()!==null;if(e&&t)return;let s=this.db.query("PRAGMA table_info(observations)").all(),n=s.some(i=>i.name==="memory_session_id"),o=s.some(i=>i.name==="content_hash");if(!n||!o){this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(29,new Date().toISOString());return}this.db.run("BEGIN TRANSACTION");try{this.db.run(`
        DELETE FROM observations
         WHERE id NOT IN (
           SELECT MIN(id) FROM observations
            GROUP BY memory_session_id, content_hash
         )
      `),this.db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS ux_observations_session_hash
        ON observations(memory_session_id, content_hash)
      `),this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(29,new Date().toISOString()),this.db.run("COMMIT"),m.debug("DB","Ensured UNIQUE(memory_session_id, content_hash) index on observations")}catch(i){throw this.db.run("ROLLBACK"),i}}addObservationRawTypeColumn(){let e=this.db.prepare("SELECT version FROM schema_versions WHERE version = ?").get(30);this.db.query("PRAGMA table_info(observations)").all().some(n=>n.name==="raw_type")||(this.db.run("ALTER TABLE observations ADD COLUMN raw_type TEXT DEFAULT NULL"),m.debug("DB","Added raw_type column to observations table")),e||this.db.prepare("INSERT OR IGNORE INTO schema_versions (version, applied_at) VALUES (?, ?)").run(30,new Date().toISOString())}updateMemorySessionId(e,t){this.db.prepare(`
      UPDATE sdk_sessions
      SET memory_session_id = ?
      WHERE id = ?
    `).run(t,e)}markSessionCompleted(e){let t=Date.now(),s=new Date(t).toISOString();this.db.prepare(`
      UPDATE sdk_sessions
      SET status = 'completed', completed_at = ?, completed_at_epoch = ?
      WHERE id = ?
    `).run(s,t,e)}ensureMemorySessionIdRegistered(e,t){let s=this.db.prepare(`
      SELECT id, memory_session_id FROM sdk_sessions WHERE id = ?
    `).get(e);if(!s)throw new Error(`Session ${e} not found in sdk_sessions`);s.memory_session_id!==t&&(this.db.prepare(`
        UPDATE sdk_sessions SET memory_session_id = ? WHERE id = ?
      `).run(t,e),m.info("DB","Registered memory_session_id before storage (FK fix)",{sessionDbId:e,oldId:s.memory_session_id,newId:t}))}getRecentSummaries(e,t=10){return this.db.prepare(`
      SELECT
        request, investigated, learned, completed, next_steps,
        files_read, files_edited, notes, prompt_number, created_at
      FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getRecentSummariesWithSessionInfo(e,t=3){return this.db.prepare(`
      SELECT
        memory_session_id, request, learned, completed, next_steps,
        prompt_number, created_at
      FROM session_summaries
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getRecentObservations(e,t=20){return this.db.prepare(`
      SELECT type, text, prompt_number, created_at
      FROM observations
      WHERE project = ?
      ORDER BY created_at_epoch DESC
      LIMIT ?
    `).all(e,t)}getAllRecentObservations(e=100){return this.db.prepare(`
      SELECT
        o.id,
        o.type,
        o.title,
        o.subtitle,
        o.text,
        o.project,
        COALESCE(s.platform_source, '${O}') as platform_source,
        o.prompt_number,
        o.created_at,
        o.created_at_epoch
      FROM observations o
      LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
      ORDER BY o.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllRecentSummaries(e=50){return this.db.prepare(`
      SELECT
        ss.id,
        ss.request,
        ss.investigated,
        ss.learned,
        ss.completed,
        ss.next_steps,
        ss.files_read,
        ss.files_edited,
        ss.notes,
        ss.project,
        COALESCE(s.platform_source, '${O}') as platform_source,
        ss.prompt_number,
        ss.created_at,
        ss.created_at_epoch
      FROM session_summaries ss
      LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
      ORDER BY ss.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllRecentUserPrompts(e=100){return this.db.prepare(`
      SELECT
        up.id,
        up.content_session_id,
        s.project,
        COALESCE(s.platform_source, '${O}') as platform_source,
        up.prompt_number,
        up.prompt_text,
        up.created_at,
        up.created_at_epoch
      FROM user_prompts up
      LEFT JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      ORDER BY up.created_at_epoch DESC
      LIMIT ?
    `).all(e)}getAllProjects(e){let t=e?M(e):void 0,s=`
      SELECT DISTINCT project
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
        AND project != ?
    `,n=[ne];return t&&(s+=" AND COALESCE(platform_source, ?) = ?",n.push(O,t)),s+=" ORDER BY project ASC",this.db.prepare(s).all(...n).map(i=>i.project)}getProjectCatalog(){let e=this.db.prepare(`
      SELECT
        COALESCE(platform_source, '${O}') as platform_source,
        project,
        MAX(started_at_epoch) as latest_epoch
      FROM sdk_sessions
      WHERE project IS NOT NULL AND project != ''
        AND project != ?
      GROUP BY COALESCE(platform_source, '${O}'), project
      ORDER BY latest_epoch DESC
    `).all(ne),t=[],s=new Set,n={};for(let i of e){let a=M(i.platform_source);n[a]||(n[a]=[]),n[a].includes(i.project)||n[a].push(i.project),s.has(i.project)||(s.add(i.project),t.push(i.project))}let o=Pe(Object.keys(n));return{projects:t,sources:o,projectsBySource:Object.fromEntries(o.map(i=>[i,n[i]||[]]))}}getLatestUserPrompt(e){return this.db.prepare(`
      SELECT
        up.*,
        s.memory_session_id,
        s.project,
        COALESCE(s.platform_source, '${O}') as platform_source
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.content_session_id = ?
      ORDER BY up.created_at_epoch DESC
      LIMIT 1
    `).get(e)}getRecentSessionsWithStatus(e,t=3){return this.db.prepare(`
      SELECT * FROM (
        SELECT
          s.memory_session_id,
          s.status,
          s.started_at,
          s.started_at_epoch,
          s.user_prompt,
          CASE WHEN sum.memory_session_id IS NOT NULL THEN 1 ELSE 0 END as has_summary
        FROM sdk_sessions s
        LEFT JOIN session_summaries sum ON s.memory_session_id = sum.memory_session_id
        WHERE s.project = ? AND s.memory_session_id IS NOT NULL
        GROUP BY s.memory_session_id
        ORDER BY s.started_at_epoch DESC
        LIMIT ?
      )
      ORDER BY started_at_epoch ASC
    `).all(e,t)}getObservationsForSession(e){return this.db.prepare(`
      SELECT title, subtitle, type, prompt_number
      FROM observations
      WHERE memory_session_id = ?
      ORDER BY created_at_epoch ASC
    `).all(e)}getObservationById(e){return this.db.prepare(`
      SELECT *
      FROM observations
      WHERE id = ?
    `).get(e)||null}getObservationsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o,type:i,concepts:a,files:d}=t,u=s==="date_asc"?"ASC":"DESC",c=n?`LIMIT ${n}`:"",_=e.map(()=>"?").join(","),p=[...e],g=[];if(o&&(g.push("project = ?"),p.push(o)),i)if(Array.isArray(i)){let E=i.map(()=>"?").join(",");g.push(`type IN (${E})`),p.push(...i)}else g.push("type = ?"),p.push(i);if(a){let E=Array.isArray(a)?a:[a],S=E.map(()=>"EXISTS (SELECT 1 FROM json_each(concepts) WHERE value = ?)");p.push(...E),g.push(`(${S.join(" OR ")})`)}if(d){let E=Array.isArray(d)?d:[d],S=E.map(()=>"(EXISTS (SELECT 1 FROM json_each(files_read) WHERE value LIKE ?) OR EXISTS (SELECT 1 FROM json_each(files_modified) WHERE value LIKE ?))");E.forEach(T=>{p.push(`%${T}%`,`%${T}%`)}),g.push(`(${S.join(" OR ")})`)}let h=g.length>0?`WHERE id IN (${_}) AND ${g.join(" AND ")}`:`WHERE id IN (${_})`;return this.db.prepare(`
      SELECT *
      FROM observations
      ${h}
      ORDER BY created_at_epoch ${u}
      ${c}
    `).all(...p)}getSummaryForSession(e){return this.db.prepare(`
      SELECT
        request, investigated, learned, completed, next_steps,
        files_read, files_edited, notes, prompt_number, created_at,
        created_at_epoch
      FROM session_summaries
      WHERE memory_session_id = ?
      ORDER BY created_at_epoch DESC
      LIMIT 1
    `).get(e)||null}getFilesForSession(e){let s=this.db.prepare(`
      SELECT files_read, files_modified
      FROM observations
      WHERE memory_session_id = ?
    `).all(e),n=new Set,o=new Set;for(let i of s)ie(i.files_read).forEach(a=>n.add(a)),ie(i.files_modified).forEach(a=>o.add(a));return{filesRead:Array.from(n),filesModified:Array.from(o)}}getSessionById(e){return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project,
             COALESCE(platform_source, '${O}') as platform_source,
             user_prompt, custom_title, status
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}getSdkSessionsBySessionIds(e){if(e.length===0)return[];let t=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT id, content_session_id, memory_session_id, project,
             COALESCE(platform_source, '${O}') as platform_source,
             user_prompt, custom_title,
             started_at, started_at_epoch, completed_at, completed_at_epoch, status
      FROM sdk_sessions
      WHERE memory_session_id IN (${t})
      ORDER BY started_at_epoch DESC
    `).all(...e)}getPromptNumberFromUserPrompts(e){return this.db.prepare(`
      SELECT COUNT(*) as count FROM user_prompts WHERE content_session_id = ?
    `).get(e).count}createSDKSession(e,t,s,n,o){let i=new Date,a=i.getTime(),d=cs(n,o),u=d.platformSource??O,c=this.db.prepare(`
      SELECT id, platform_source FROM sdk_sessions WHERE content_session_id = ?
    `).get(e);if(c){if(t&&this.db.prepare(`
          UPDATE sdk_sessions SET project = ?
          WHERE content_session_id = ? AND (project IS NULL OR project = '')
        `).run(t,e),d.customTitle&&this.db.prepare(`
          UPDATE sdk_sessions SET custom_title = ?
          WHERE content_session_id = ? AND custom_title IS NULL
        `).run(d.customTitle,e),d.platformSource){let p=c.platform_source?.trim()?M(c.platform_source):void 0;if(!p)this.db.prepare(`
            UPDATE sdk_sessions SET platform_source = ?
            WHERE content_session_id = ?
              AND COALESCE(platform_source, '') = ''
          `).run(d.platformSource,e);else if(p!==d.platformSource)throw new Error(`Platform source conflict for session ${e}: existing=${p}, received=${d.platformSource}`)}return c.id}return this.db.prepare(`
      INSERT INTO sdk_sessions
      (content_session_id, memory_session_id, project, platform_source, user_prompt, custom_title, started_at, started_at_epoch, status)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'active')
    `).run(e,t,u,s,d.customTitle||null,i.toISOString(),a),this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e).id}saveUserPrompt(e,t,s){let n=new Date,o=n.getTime();return this.db.prepare(`
      INSERT INTO user_prompts
      (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `).run(e,t,s,n.toISOString(),o).lastInsertRowid}getUserPrompt(e,t){return this.db.prepare(`
      SELECT prompt_text
      FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
      LIMIT 1
    `).get(e,t)?.prompt_text??null}storeObservation(e,t,s,n,o=0,i,a){let d=i??Date.now(),u=new Date(d).toISOString(),c=q(e,s.title,s.narrative),p=this.db.prepare(`
      INSERT INTO observations
      (memory_session_id, project, type, raw_type, title, subtitle, facts, narrative, concepts,
       files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
       generated_by_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_session_id, content_hash) DO NOTHING
      RETURNING id, created_at_epoch
    `).get(e,t,s.type,s.raw_type??null,s.title,s.subtitle,JSON.stringify(s.facts),s.narrative,JSON.stringify(s.concepts),JSON.stringify(s.files_read),JSON.stringify(s.files_modified),n||null,o,s.agent_type??null,s.agent_id??null,c,u,d,a||null);if(p)return{id:p.id,createdAtEpoch:p.created_at_epoch};let g=this.db.prepare("SELECT id, created_at_epoch FROM observations WHERE memory_session_id = ? AND content_hash = ?").get(e,c);if(!g)throw new Error(`storeObservation: ON CONFLICT without existing row for content_hash=${c}`);return{id:g.id,createdAtEpoch:g.created_at_epoch}}storeSummary(e,t,s,n,o=0,i){let a=i??Date.now(),d=new Date(a).toISOString(),c=this.db.prepare(`
      INSERT INTO session_summaries
      (memory_session_id, project, request, investigated, learned, completed,
       next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e,t,s.request,s.investigated,s.learned,s.completed,s.next_steps,s.notes,n||null,o,d,a);return{id:Number(c.lastInsertRowid),createdAtEpoch:a}}storeObservations(e,t,s,n,o,i=0,a,d){let u=a??Date.now(),c=new Date(u).toISOString();return this.db.transaction(()=>{let p=[],g=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, raw_type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
         generated_by_model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_session_id, content_hash) DO NOTHING
        RETURNING id
      `),h=this.db.prepare("SELECT id FROM observations WHERE memory_session_id = ? AND content_hash = ?");for(let E of s){let S=q(e,E.title,E.narrative),T=g.get(e,t,E.type,E.raw_type??null,E.title,E.subtitle,JSON.stringify(E.facts),E.narrative,JSON.stringify(E.concepts),JSON.stringify(E.files_read),JSON.stringify(E.files_modified),o||null,i,E.agent_type??null,E.agent_id??null,S,c,u,d||null);if(T){p.push(T.id);continue}let f=h.get(e,S);if(!f)throw new Error(`storeObservations: ON CONFLICT without existing row for content_hash=${S}`);p.push(f.id)}let C=null;if(n){let S=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,n.request,n.investigated,n.learned,n.completed,n.next_steps,n.notes,o||null,i,c,u);C=Number(S.lastInsertRowid)}return{observationIds:p,summaryId:C,createdAtEpoch:u}})()}storeObservationsAndMarkComplete(e,t,s,n,o,i,a,d=0,u,c){let _=u??Date.now(),p=new Date(_).toISOString();return this.db.transaction(()=>{let h=[],C=this.db.prepare(`
        INSERT INTO observations
        (memory_session_id, project, type, raw_type, title, subtitle, facts, narrative, concepts,
         files_read, files_modified, prompt_number, discovery_tokens, agent_type, agent_id, content_hash, created_at, created_at_epoch,
         generated_by_model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_session_id, content_hash) DO NOTHING
        RETURNING id
      `),E=this.db.prepare("SELECT id FROM observations WHERE memory_session_id = ? AND content_hash = ?");for(let f of s){let x=q(e,f.title,f.narrative),Ce=C.get(e,t,f.type,f.raw_type??null,f.title,f.subtitle,JSON.stringify(f.facts),f.narrative,JSON.stringify(f.concepts),JSON.stringify(f.files_read),JSON.stringify(f.files_modified),a||null,d,f.agent_type??null,f.agent_id??null,x,p,_,c||null);if(Ce){h.push(Ce.id);continue}let Ne=E.get(e,x);if(!Ne)throw new Error(`storeObservationsAndMarkComplete: ON CONFLICT without existing row for content_hash=${x}`);h.push(Ne.id)}let S;if(n){let x=this.db.prepare(`
          INSERT INTO session_summaries
          (memory_session_id, project, request, investigated, learned, completed,
           next_steps, notes, prompt_number, discovery_tokens, created_at, created_at_epoch)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(e,t,n.request,n.investigated,n.learned,n.completed,n.next_steps,n.notes,a||null,d,p,_);S=Number(x.lastInsertRowid)}return this.db.prepare(`
        UPDATE pending_messages
        SET
          status = 'processed',
          completed_at_epoch = ?,
          tool_input = NULL,
          tool_response = NULL
        WHERE id = ? AND status = 'processing'
      `).run(_,o),{observationIds:h,summaryId:S,createdAtEpoch:_}})()}getSessionSummariesByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o}=t,i=s==="date_asc"?"ASC":"DESC",a=n?`LIMIT ${n}`:"",d=e.map(()=>"?").join(","),u=[...e],c=o?`WHERE id IN (${d}) AND project = ?`:`WHERE id IN (${d})`;return o&&u.push(o),this.db.prepare(`
      SELECT * FROM session_summaries
      ${c}
      ORDER BY created_at_epoch ${i}
      ${a}
    `).all(...u)}getUserPromptsByIds(e,t={}){if(e.length===0)return[];let{orderBy:s="date_desc",limit:n,project:o}=t,i=s==="date_asc"?"ASC":"DESC",a=n?`LIMIT ${n}`:"",d=e.map(()=>"?").join(","),u=[...e],c=o?"AND s.project = ?":"";return o&&u.push(o),this.db.prepare(`
      SELECT
        up.*,
        s.project,
        s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.id IN (${d}) ${c}
      ORDER BY up.created_at_epoch ${i}
      ${a}
    `).all(...u)}getTimelineAroundTimestamp(e,t=10,s=10,n){return this.getTimelineAroundObservation(null,e,t,s,n)}getTimelineAroundObservation(e,t,s=10,n=10,o){let i=o?"AND project = ?":"",a=o?[o]:[],d,u;if(e!==null){let E=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id <= ? ${i}
        ORDER BY id DESC
        LIMIT ?
      `,S=`
        SELECT id, created_at_epoch
        FROM observations
        WHERE id >= ? ${i}
        ORDER BY id ASC
        LIMIT ?
      `;try{let T=this.db.prepare(E).all(e,...a,s+1),f=this.db.prepare(S).all(e,...a,n+1);if(T.length===0&&f.length===0)return{observations:[],sessions:[],prompts:[]};d=T.length>0?T[T.length-1].created_at_epoch:t,u=f.length>0?f[f.length-1].created_at_epoch:t}catch(T){return T instanceof Error?m.error("DB","Error getting boundary observations",{project:o},T):m.error("DB","Error getting boundary observations with non-Error",{},new Error(String(T))),{observations:[],sessions:[],prompts:[]}}}else{let E=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch <= ? ${i}
        ORDER BY created_at_epoch DESC
        LIMIT ?
      `,S=`
        SELECT created_at_epoch
        FROM observations
        WHERE created_at_epoch >= ? ${i}
        ORDER BY created_at_epoch ASC
        LIMIT ?
      `;try{let T=this.db.prepare(E).all(t,...a,s),f=this.db.prepare(S).all(t,...a,n+1);if(T.length===0&&f.length===0)return{observations:[],sessions:[],prompts:[]};d=T.length>0?T[T.length-1].created_at_epoch:t,u=f.length>0?f[f.length-1].created_at_epoch:t}catch(T){return T instanceof Error?m.error("DB","Error getting boundary timestamps",{project:o},T):m.error("DB","Error getting boundary timestamps with non-Error",{},new Error(String(T))),{observations:[],sessions:[],prompts:[]}}}let c=`
      SELECT *
      FROM observations
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${i}
      ORDER BY created_at_epoch ASC
    `,_=`
      SELECT *
      FROM session_summaries
      WHERE created_at_epoch >= ? AND created_at_epoch <= ? ${i}
      ORDER BY created_at_epoch ASC
    `,p=`
      SELECT up.*, s.project, s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE up.created_at_epoch >= ? AND up.created_at_epoch <= ? ${i.replace("project","s.project")}
      ORDER BY up.created_at_epoch ASC
    `,g=this.db.prepare(c).all(d,u,...a),h=this.db.prepare(_).all(d,u,...a),C=this.db.prepare(p).all(d,u,...a);return{observations:g,sessions:h.map(E=>({id:E.id,memory_session_id:E.memory_session_id,project:E.project,request:E.request,completed:E.completed,next_steps:E.next_steps,created_at:E.created_at,created_at_epoch:E.created_at_epoch})),prompts:C.map(E=>({id:E.id,content_session_id:E.content_session_id,prompt_number:E.prompt_number,prompt_text:E.prompt_text,project:E.project,created_at:E.created_at,created_at_epoch:E.created_at_epoch}))}}getPromptById(e){return this.db.prepare(`
      SELECT
        p.id,
        p.content_session_id,
        p.prompt_number,
        p.prompt_text,
        s.project,
        p.created_at,
        p.created_at_epoch
      FROM user_prompts p
      LEFT JOIN sdk_sessions s ON p.content_session_id = s.content_session_id
      WHERE p.id = ?
      LIMIT 1
    `).get(e)||null}getPromptsByIds(e){if(e.length===0)return[];let t=e.map(()=>"?").join(",");return this.db.prepare(`
      SELECT
        p.id,
        p.content_session_id,
        p.prompt_number,
        p.prompt_text,
        s.project,
        p.created_at,
        p.created_at_epoch
      FROM user_prompts p
      LEFT JOIN sdk_sessions s ON p.content_session_id = s.content_session_id
      WHERE p.id IN (${t})
      ORDER BY p.created_at_epoch DESC
    `).all(...e)}getSessionSummaryById(e){return this.db.prepare(`
      SELECT
        id,
        memory_session_id,
        content_session_id,
        project,
        user_prompt,
        request_summary,
        learned_summary,
        status,
        created_at,
        created_at_epoch
      FROM sdk_sessions
      WHERE id = ?
      LIMIT 1
    `).get(e)||null}getOrCreateManualSession(e){let t=`manual-${e}`,s=`manual-content-${e}`;if(this.db.prepare("SELECT memory_session_id FROM sdk_sessions WHERE memory_session_id = ?").get(t))return t;let o=new Date;return this.db.prepare(`
      INSERT INTO sdk_sessions (memory_session_id, content_session_id, project, platform_source, started_at, started_at_epoch, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(t,s,e,O,o.toISOString(),o.getTime()),m.info("SESSION","Created manual session",{memorySessionId:t,project:e}),t}close(){this.db.close()}importSdkSession(e){let t=this.db.prepare("SELECT id FROM sdk_sessions WHERE content_session_id = ?").get(e.content_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO sdk_sessions (
        content_session_id, memory_session_id, project, platform_source, user_prompt,
        started_at, started_at_epoch, completed_at, completed_at_epoch, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.content_session_id,e.memory_session_id,e.project,M(e.platform_source),e.user_prompt,e.started_at,e.started_at_epoch,e.completed_at,e.completed_at_epoch,e.status).lastInsertRowid}}importSessionSummary(e){let t=this.db.prepare("SELECT id FROM session_summaries WHERE memory_session_id = ?").get(e.memory_session_id);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO session_summaries (
        memory_session_id, project, request, investigated, learned,
        completed, next_steps, files_read, files_edited, notes,
        prompt_number, discovery_tokens, created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.memory_session_id,e.project,e.request,e.investigated,e.learned,e.completed,e.next_steps,e.files_read,e.files_edited,e.notes,e.prompt_number,e.discovery_tokens||0,e.created_at,e.created_at_epoch).lastInsertRowid}}importObservation(e){let t=this.db.prepare(`
      SELECT id FROM observations
      WHERE memory_session_id = ? AND title = ? AND created_at_epoch = ?
    `).get(e.memory_session_id,e.title,e.created_at_epoch);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO observations (
        memory_session_id, project, text, type, title, subtitle,
        facts, narrative, concepts, files_read, files_modified,
        prompt_number, discovery_tokens, agent_type, agent_id,
        created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(e.memory_session_id,e.project,e.text,e.type,e.title,e.subtitle,e.facts,e.narrative,e.concepts,e.files_read,e.files_modified,e.prompt_number,e.discovery_tokens||0,e.agent_type??null,e.agent_id??null,e.created_at,e.created_at_epoch).lastInsertRowid}}rebuildObservationsFTSIndex(){this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='observations_fts'").all().length>0&&this.db.run("INSERT INTO observations_fts(observations_fts) VALUES('rebuild')")}importUserPrompt(e){let t=this.db.prepare(`
      SELECT id FROM user_prompts
      WHERE content_session_id = ? AND prompt_number = ?
    `).get(e.content_session_id,e.prompt_number);return t?{imported:!1,id:t.id}:{imported:!0,id:this.db.prepare(`
      INSERT INTO user_prompts (
        content_session_id, prompt_number, prompt_text,
        created_at, created_at_epoch
      ) VALUES (?, ?, ?, ?, ?)
    `).run(e.content_session_id,e.prompt_number,e.prompt_text,e.created_at,e.created_at_epoch).lastInsertRowid}}};var Ge=y(require("path"),1),He=require("os");var N=require("fs"),k=require("path"),de=require("os"),V=class{static DEFAULTS={CLAUDE_MEM_MODEL:"claude-sonnet-4-6",CLAUDE_MEM_CONTEXT_OBSERVATIONS:"50",CLAUDE_MEM_WORKER_PORT:String(37700+(process.getuid?.()??77)%100),CLAUDE_MEM_WORKER_HOST:"127.0.0.1",CLAUDE_MEM_SKIP_TOOLS:"ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion",CLAUDE_MEM_PROVIDER:"claude",CLAUDE_MEM_CLAUDE_AUTH_METHOD:"cli",CLAUDE_MEM_GEMINI_API_KEY:"",CLAUDE_MEM_GEMINI_MODEL:"gemini-2.5-flash-lite",CLAUDE_MEM_GEMINI_RATE_LIMITING_ENABLED:"true",CLAUDE_MEM_GEMINI_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_GEMINI_MAX_TOKENS:"100000",CLAUDE_MEM_OPENROUTER_API_KEY:"",CLAUDE_MEM_OPENROUTER_MODEL:"xiaomi/mimo-v2-flash:free",CLAUDE_MEM_OPENROUTER_SITE_URL:"",CLAUDE_MEM_OPENROUTER_APP_NAME:"claude-mem",CLAUDE_MEM_OPENROUTER_MAX_CONTEXT_MESSAGES:"20",CLAUDE_MEM_OPENROUTER_MAX_TOKENS:"100000",CLAUDE_MEM_DATA_DIR:(0,k.join)((0,de.homedir)(),".claude-mem"),CLAUDE_MEM_LOG_LEVEL:"INFO",CLAUDE_MEM_PYTHON_VERSION:"3.13",CLAUDE_CODE_PATH:"",CLAUDE_MEM_MODE:"code",CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT:"false",CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT:"true",CLAUDE_MEM_CONTEXT_FULL_COUNT:"0",CLAUDE_MEM_CONTEXT_FULL_FIELD:"narrative",CLAUDE_MEM_CONTEXT_SESSION_COUNT:"10",CLAUDE_MEM_CONTEXT_BUDGET:"2048",CLAUDE_MEM_CONTEXT_STALENESS_DAYS:"7",CLAUDE_MEM_CONTEXT_VERBOSE:"false",CLAUDE_MEM_CONTEXT_STATE_HEADER:"true",CLAUDE_MEM_CONTEXT_PRIORITY_RANKING:"true",CLAUDE_MEM_CONTEXT_BLOCKERS_SECTION:"true",CLAUDE_MEM_CONTEXT_BLOCKERS_MAX:"5",CLAUDE_MEM_CONTEXT_SUBJECT_CLUSTERING:"true",CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY:"true",CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE:"false",CLAUDE_MEM_CONTEXT_SHOW_TERMINAL_OUTPUT:"true",CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED:"false",CLAUDE_MEM_FOLDER_USE_LOCAL_MD:"false",CLAUDE_MEM_TRANSCRIPTS_ENABLED:"true",CLAUDE_MEM_TRANSCRIPTS_CONFIG_PATH:(0,k.join)((0,de.homedir)(),".claude-mem","transcript-watch.json"),CLAUDE_MEM_MAX_CONCURRENT_AGENTS:"2",CLAUDE_MEM_HOOK_FAIL_LOUD_THRESHOLD:"3",CLAUDE_MEM_EXCLUDED_PROJECTS:"",CLAUDE_MEM_FOLDER_MD_EXCLUDE:"[]",CLAUDE_MEM_SEMANTIC_INJECT:"false",CLAUDE_MEM_SEMANTIC_INJECT_LIMIT:"5",CLAUDE_MEM_TIER_ROUTING_ENABLED:"true",CLAUDE_MEM_TIER_SIMPLE_MODEL:"haiku",CLAUDE_MEM_TIER_SUMMARY_MODEL:"",CLAUDE_MEM_CHROMA_ENABLED:"true",CLAUDE_MEM_CHROMA_MODE:"local",CLAUDE_MEM_CHROMA_HOST:"127.0.0.1",CLAUDE_MEM_CHROMA_PORT:"8000",CLAUDE_MEM_CHROMA_SSL:"false",CLAUDE_MEM_CHROMA_API_KEY:"",CLAUDE_MEM_CHROMA_TENANT:"default_tenant",CLAUDE_MEM_CHROMA_DATABASE:"default_database",CLAUDE_MEM_TELEGRAM_ENABLED:"true",CLAUDE_MEM_TELEGRAM_BOT_TOKEN:"",CLAUDE_MEM_TELEGRAM_CHAT_ID:"",CLAUDE_MEM_TELEGRAM_TRIGGER_TYPES:"security_alert",CLAUDE_MEM_TELEGRAM_TRIGGER_CONCEPTS:""};static getAllDefaults(){return{...this.DEFAULTS}}static get(e){return process.env[e]??this.DEFAULTS[e]}static getInt(e){let t=this.get(e);return parseInt(t,10)}static getBool(e){let t=this.get(e);return t==="true"||t===!0}static applyEnvOverrides(e){let t={...e};for(let s of Object.keys(this.DEFAULTS))process.env[s]!==void 0&&(t[s]=process.env[s]);return t}static loadFromFile(e){try{if(!(0,N.existsSync)(e)){let i=this.getAllDefaults();try{let a=(0,k.dirname)(e);(0,N.existsSync)(a)||(0,N.mkdirSync)(a,{recursive:!0}),(0,N.writeFileSync)(e,JSON.stringify(i,null,2),"utf-8"),console.log("[SETTINGS] Created settings file with defaults:",e)}catch(a){console.warn("[SETTINGS] Failed to create settings file, using in-memory defaults:",e,a instanceof Error?a.message:String(a))}return this.applyEnvOverrides(i)}let t=(0,N.readFileSync)(e,"utf-8"),s=JSON.parse(t),n=s;if(s.env&&typeof s.env=="object"){n=s.env;try{(0,N.writeFileSync)(e,JSON.stringify(n,null,2),"utf-8"),console.log("[SETTINGS] Migrated settings file from nested to flat schema:",e)}catch(i){console.warn("[SETTINGS] Failed to auto-migrate settings file:",e,i instanceof Error?i.message:String(i))}}let o={...this.DEFAULTS};for(let i of Object.keys(this.DEFAULTS))n[i]!==void 0&&(o[i]=n[i]);return this.applyEnvOverrides(o)}catch(t){return console.warn("[SETTINGS] Failed to load settings, using defaults:",e,t instanceof Error?t.message:String(t)),this.applyEnvOverrides(this.getAllDefaults())}}};var $=require("fs"),Y=require("path");var A=class r{static instance=null;activeMode=null;modesDir;constructor(){let e=xe(),t=[(0,Y.join)(e,"modes"),(0,Y.join)(e,"..","plugin","modes")],s=t.find(n=>(0,$.existsSync)(n));this.modesDir=s||t[0]}static getInstance(){return r.instance||(r.instance=new r),r.instance}parseInheritance(e){let t=e.split("--");if(t.length===1)return{hasParent:!1,parentId:"",overrideId:""};if(t.length>2)throw new Error(`Invalid mode inheritance: ${e}. Only one level of inheritance supported (parent--override)`);return{hasParent:!0,parentId:t[0],overrideId:e}}isPlainObject(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}deepMerge(e,t){let s={...e};for(let n in t){let o=t[n],i=e[n];this.isPlainObject(o)&&this.isPlainObject(i)?s[n]=this.deepMerge(i,o):s[n]=o}return s}loadModeFile(e){let t=(0,Y.join)(this.modesDir,`${e}.json`);if(!(0,$.existsSync)(t))throw new Error(`Mode file not found: ${t}`);let s=(0,$.readFileSync)(t,"utf-8");return JSON.parse(s)}loadMode(e){let t=this.parseInheritance(e);if(!t.hasParent)try{let d=this.loadModeFile(e);return this.activeMode=d,m.debug("SYSTEM",`Loaded mode: ${d.name} (${e})`,void 0,{types:d.observation_types.map(u=>u.id),concepts:d.observation_concepts.map(u=>u.id)}),d}catch(d){if(d instanceof Error?m.warn("WORKER",`Mode file not found: ${e}, falling back to 'code'`,{message:d.message}):m.warn("WORKER",`Mode file not found: ${e}, falling back to 'code'`,{error:String(d)}),e==="code")throw new Error("Critical: code.json mode file missing");return this.loadMode("code")}let{parentId:s,overrideId:n}=t,o;try{o=this.loadMode(s)}catch(d){d instanceof Error?m.warn("WORKER",`Parent mode '${s}' not found for ${e}, falling back to 'code'`,{message:d.message}):m.warn("WORKER",`Parent mode '${s}' not found for ${e}, falling back to 'code'`,{error:String(d)}),o=this.loadMode("code")}let i;try{i=this.loadModeFile(n),m.debug("SYSTEM",`Loaded override file: ${n} for parent ${s}`)}catch(d){return d instanceof Error?m.warn("WORKER",`Override file '${n}' not found, using parent mode '${s}' only`,{message:d.message}):m.warn("WORKER",`Override file '${n}' not found, using parent mode '${s}' only`,{error:String(d)}),this.activeMode=o,o}if(!i)return m.warn("SYSTEM",`Invalid override file: ${n}, using parent mode '${s}' only`),this.activeMode=o,o;let a=this.deepMerge(o,i);return this.activeMode=a,m.debug("SYSTEM",`Loaded mode with inheritance: ${a.name} (${e} = ${s} + ${n})`,void 0,{parent:s,override:n,types:a.observation_types.map(d=>d.id),concepts:a.observation_concepts.map(d=>d.id)}),a}getActiveMode(){if(!this.activeMode)throw new Error("No mode loaded. Call loadMode() first.");return this.activeMode}getObservationTypes(){return this.getActiveMode().observation_types}getObservationConcepts(){return this.getActiveMode().observation_concepts}getTypeIcon(e){return this.getObservationTypes().find(s=>s.id===e)?.emoji||"\u{1F4DD}"}getWorkEmoji(e){return this.getObservationTypes().find(s=>s.id===e)?.work_emoji||"\u{1F4DD}"}validateType(e){return this.getObservationTypes().some(t=>t.id===e)}getTypeLabel(e){return this.getObservationTypes().find(s=>s.id===e)?.label||e}};function ce(){let r=Ge.default.join((0,He.homedir)(),".claude-mem","settings.json"),e=V.loadFromFile(r),t=A.getInstance().getActiveMode(),s=new Set(t.observation_types.map(o=>o.id)),n=new Set(t.observation_concepts.map(o=>o.id));return{totalObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_OBSERVATIONS,10),fullObservationCount:parseInt(e.CLAUDE_MEM_CONTEXT_FULL_COUNT,10),sessionCount:parseInt(e.CLAUDE_MEM_CONTEXT_SESSION_COUNT,10),showReadTokens:e.CLAUDE_MEM_CONTEXT_SHOW_READ_TOKENS==="true",showWorkTokens:e.CLAUDE_MEM_CONTEXT_SHOW_WORK_TOKENS==="true",showSavingsAmount:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_AMOUNT==="true",showSavingsPercent:e.CLAUDE_MEM_CONTEXT_SHOW_SAVINGS_PERCENT==="true",observationTypes:s,observationConcepts:n,fullObservationField:e.CLAUDE_MEM_CONTEXT_FULL_FIELD,showLastSummary:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_SUMMARY==="true",showLastMessage:e.CLAUDE_MEM_CONTEXT_SHOW_LAST_MESSAGE==="true",contextBudgetTokens:parseInt(e.CLAUDE_MEM_CONTEXT_BUDGET,10)||0,includeStale:!1,stalenessCutoffEpoch:(()=>{let o=parseInt(e.CLAUDE_MEM_CONTEXT_STALENESS_DAYS,10);return o>0?Date.now()-o*24*60*60*1e3:0})(),verbose:e.CLAUDE_MEM_CONTEXT_VERBOSE==="true",showStateHeader:e.CLAUDE_MEM_CONTEXT_STATE_HEADER==="true",priorityRanking:e.CLAUDE_MEM_CONTEXT_PRIORITY_RANKING==="true",showBlockers:e.CLAUDE_MEM_CONTEXT_BLOCKERS_SECTION==="true",maxBlockers:(()=>{let o=parseInt(e.CLAUDE_MEM_CONTEXT_BLOCKERS_MAX,10);return Number.isFinite(o)&&o>0?o:5})(),subjectClustering:e.CLAUDE_MEM_CONTEXT_SUBJECT_CLUSTERING==="true"}}var l={reset:"\x1B[0m",bright:"\x1B[1m",dim:"\x1B[2m",cyan:"\x1B[36m",green:"\x1B[32m",yellow:"\x1B[33m",blue:"\x1B[34m",magenta:"\x1B[35m",gray:"\x1B[90m",red:"\x1B[31m"},Xe=4,ue=1;function le(r){let e=(r.title?.length||0)+(r.subtitle?.length||0)+(r.narrative?.length||0)+JSON.stringify(r.facts||[]).length;return Math.ceil(e/Xe)}function _e(r){let e=r.length,t=r.reduce((i,a)=>i+le(a),0),s=r.reduce((i,a)=>i+(a.discovery_tokens||0),0),n=s-t,o=s>0?Math.round(n/s*100):0;return{totalObservations:e,totalReadTokens:t,totalDiscoveryTokens:s,savings:n,savingsPercent:o}}function us(r){return A.getInstance().getWorkEmoji(r)}function F(r,e){let t=le(r),s=r.discovery_tokens||0,n=us(r.type),o=s>0?`${n} ${s.toLocaleString()}`:"-";return{readTokens:t,discoveryTokens:s,discoveryDisplay:o,workEmoji:n}}function J(r){return r.showReadTokens||r.showWorkTokens||r.showSavingsAmount||r.showSavingsPercent}var Ve=y(require("path"),1),Q=require("fs");var ls=["private","claude-mem-context","system_instruction","system-instruction","persisted-output","system-reminder"],sn=new RegExp(`<(${ls.join("|")})\\b[^>]*>[\\s\\S]*?</\\1>`,"g"),je=/<system-reminder>[\s\S]*?<\/system-reminder>/g;var _s=[/^code references to\s+/i,/^discovery of\s+/i,/^test setup for\s+/i,/^examined\s+/i,/^identified\s+/i,/^located\s+/i,/^found\s+/i,/^analyzing\s+/i,/^analysis of\s+/i];var ms=new Set(["index","mod","main","lib","utils"]);function ps(r){let e=r.replace(/\\/g,"/").split("/").filter(Boolean);if(e.length===0)return null;let t=e[e.length-1],s=t.lastIndexOf("."),n=s>0?t.slice(0,s):t;return ms.has(n.toLowerCase())&&e.length>=2?e[e.length-2]:n||null}function Es(r){let e=r,t=!0;for(;t;){t=!1;for(let s of _s){let n=e.replace(s,"");if(n!==e){e=n,t=!0;break}}}return e}function me(r,e){if(r.length<=e)return r;let t=r.slice(0,e),s=t.lastIndexOf(" ");return s>0?t.slice(0,s).trimEnd():t}function pe(r){return r.replace(/\s+/g," ").trim()}function Be(r,e){if(e.length===1){let n=ps(e[0]);if(n){let o=pe(n).toLowerCase();return me(o,60)}}let t=r??"",s=pe(Es(t)).toLowerCase();if(s.length===0){let n=pe(t).toLowerCase();return me(n,60)}return me(s,60)}var Ee=y(require("path"),1);function L(r){if(!r)return[];try{let e=JSON.parse(r);return Array.isArray(e)?e:[]}catch(e){return m.debug("PARSER","Failed to parse JSON array, using empty fallback",{preview:r?.substring(0,50)},e instanceof Error?e:new Error(String(e))),[]}}function z(r){return new Date(r).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:!0})}function D(r){return new Date(r).toLocaleString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})}function qe(r){return new Date(r).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric"})}function We(r,e){return Ee.default.isAbsolute(r)?Ee.default.relative(e,r):r}function Ke(r,e,t){let s=L(r);if(s.length>0)return We(s[0],e);if(t){let n=L(t);if(n.length>0)return We(n[0],e)}return"General"}function ge(r,e,t){let s=Array.from(t.observationTypes),n=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(","),a=t.stalenessCutoffEpoch>0?"AND o.created_at_epoch > ?":"",d=t.includeStale?"":"AND (o.stale IS NULL OR o.stale = 0)";return r.db.prepare(`
    SELECT
      o.id,
      o.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      o.type,
      o.title,
      o.subtitle,
      o.narrative,
      o.facts,
      o.concepts,
      o.files_read,
      o.files_modified,
      o.discovery_tokens,
      o.created_at,
      o.created_at_epoch,
      o.verified_at,
      COALESCE(o.stale, 0) as stale
    FROM observations o
    LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
    WHERE (o.project = ? OR o.merged_into_project = ?)
      AND type IN (${n})
      AND EXISTS (
        SELECT 1 FROM json_each(o.concepts)
        WHERE value IN (${i})
      )
      ${a}
      ${d}
    ORDER BY o.created_at_epoch DESC
    LIMIT ?
  `).all(e,e,...s,...o,...t.stalenessCutoffEpoch>0?[t.stalenessCutoffEpoch]:[],t.totalObservationCount)}function Te(r,e,t){return r.db.prepare(`
    SELECT
      ss.id,
      ss.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      ss.request,
      ss.investigated,
      ss.learned,
      ss.completed,
      ss.next_steps,
      ss.created_at,
      ss.created_at_epoch
    FROM session_summaries ss
    LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
    WHERE (ss.project = ? OR ss.merged_into_project = ?)
    ORDER BY ss.created_at_epoch DESC
    LIMIT ?
  `).all(e,e,t.sessionCount+ue)}function Ye(r,e,t){let s=Array.from(t.observationTypes),n=s.map(()=>"?").join(","),o=Array.from(t.observationConcepts),i=o.map(()=>"?").join(","),a=e.map(()=>"?").join(","),d=t.stalenessCutoffEpoch>0?"AND o.created_at_epoch > ?":"",u=t.includeStale?"":"AND (o.stale IS NULL OR o.stale = 0)";return r.db.prepare(`
    SELECT
      o.id,
      o.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      o.type,
      o.title,
      o.subtitle,
      o.narrative,
      o.facts,
      o.concepts,
      o.files_read,
      o.files_modified,
      o.discovery_tokens,
      o.created_at,
      o.created_at_epoch,
      o.verified_at,
      COALESCE(o.stale, 0) as stale,
      o.project
    FROM observations o
    LEFT JOIN sdk_sessions s ON o.memory_session_id = s.memory_session_id
    WHERE (o.project IN (${a})
           OR o.merged_into_project IN (${a}))
      AND type IN (${n})
      AND EXISTS (
        SELECT 1 FROM json_each(o.concepts)
        WHERE value IN (${i})
      )
      ${d}
      ${u}
    ORDER BY o.created_at_epoch DESC
    LIMIT ?
  `).all(...e,...e,...s,...o,...t.stalenessCutoffEpoch>0?[t.stalenessCutoffEpoch]:[],t.totalObservationCount)}function Je(r,e,t){let s=e.map(()=>"?").join(",");return r.db.prepare(`
    SELECT
      ss.id,
      ss.memory_session_id,
      COALESCE(s.platform_source, 'claude') as platform_source,
      ss.request,
      ss.investigated,
      ss.learned,
      ss.completed,
      ss.next_steps,
      ss.created_at,
      ss.created_at_epoch,
      ss.project
    FROM session_summaries ss
    LEFT JOIN sdk_sessions s ON ss.memory_session_id = s.memory_session_id
    WHERE (ss.project IN (${s})
           OR ss.merged_into_project IN (${s}))
    ORDER BY ss.created_at_epoch DESC
    LIMIT ?
  `).all(...e,...e,t.sessionCount+ue)}function gs(r){return r.replace(/\//g,"-")}function Ts(r){if(!r.includes('"type":"assistant"'))return null;let e=JSON.parse(r);if(e.type==="assistant"&&e.message?.content&&Array.isArray(e.message.content)){let t="";for(let s of e.message.content)s.type==="text"&&(t+=s.text);if(t=t.replace(je,"").trim(),t)return t}return null}function fs(r){for(let e=r.length-1;e>=0;e--)try{let t=Ts(r[e]);if(t)return t}catch(t){t instanceof Error?m.debug("WORKER","Skipping malformed transcript line",{lineIndex:e},t):m.debug("WORKER","Skipping malformed transcript line",{lineIndex:e,error:String(t)});continue}return""}function bs(r){try{if(!(0,Q.existsSync)(r))return{userMessage:"",assistantMessage:""};let e=(0,Q.readFileSync)(r,"utf-8").trim();if(!e)return{userMessage:"",assistantMessage:""};let t=e.split(`
`).filter(n=>n.trim());return{userMessage:"",assistantMessage:fs(t)}}catch(e){return e instanceof Error?m.failure("WORKER","Failed to extract prior messages from transcript",{transcriptPath:r},e):m.warn("WORKER","Failed to extract prior messages from transcript",{transcriptPath:r,error:String(e)}),{userMessage:"",assistantMessage:""}}}function fe(r,e,t,s){if(!e.showLastMessage||r.length===0)return{userMessage:"",assistantMessage:""};let n=r.find(d=>d.memory_session_id!==t);if(!n)return{userMessage:"",assistantMessage:""};let o=n.memory_session_id,i=gs(s),a=Ve.default.join(v,"projects",i,`${o}.jsonl`);return bs(a)}function ze(r,e){let t=e[0]?.id;return r.map((s,n)=>{let o=n===0?null:e[n+1];return{...s,displayEpoch:o?o.created_at_epoch:s.created_at_epoch,displayTime:o?o.created_at:s.created_at,shouldShowLink:s.id!==t}})}function be(r,e){let t=[...r.map(s=>({type:"observation",data:s})),...e.map(s=>({type:"summary",data:s}))];return t.sort((s,n)=>{let o=s.type==="observation"?s.data.created_at_epoch:s.data.displayEpoch,i=n.type==="observation"?n.data.created_at_epoch:n.data.displayEpoch;return o-i}),t}function Qe(r,e){return new Set(r.slice(0,e).map(t=>t.id))}var Ss={decision:10,security_alert:9,bugfix:8,feature:6,change:4,refactor:4,security_note:3,discovery:1},hs=1,Os=7,As=1440*60*1e3;function Rs(r){let e=Math.max(0,r);return Math.pow(.5,e/Os)}function Se(r,e){let t=Ss[r.type]??hs,s=(e-r.created_at_epoch)/As;return t*Rs(s)}function Ze(r,e=Date.now()){let t=new Map;for(let s of r)t.set(s.id,Se(s,e));return t}function et(r,e=Date.now(),t){let s=r.map((n,o)=>({obs:n,index:o,score:t?.get(n.id)??Se(n,e)}));return s.sort((n,o)=>n.score!==o.score?o.score-n.score:n.obs.created_at_epoch!==o.obs.created_at_epoch?o.obs.created_at_epoch-n.obs.created_at_epoch:n.index-o.index),s.map(n=>n.obs)}function Cs(r){return L(r)}function tt(r,e=Date.now(),t){if(r.length===0)return[];let s=new Map;for(let o=0;o<r.length;o++){let i=r[o],a=Cs(i.files_modified),u=Be(i.title,a).trim(),c=u.length>0?u:(i.title??"").replace(/\s+/g," ").trim().toLowerCase()||`obs-${i.id}`,_=u.length>0?`subject:${c}`:`singleton:${i.id}`,p={obs:i,index:o,score:t?.get(i.id)??Se(i,e)},g=s.get(_);g||(g=[],s.set(_,g)),g.push(p)}let n=[];for(let[o,i]of s){i.sort((_,p)=>_.score!==p.score?p.score-_.score:_.obs.created_at_epoch!==p.obs.created_at_epoch?p.obs.created_at_epoch-_.obs.created_at_epoch:_.index-p.index);let a=i.map(_=>_.obs),d=i[0],u=i.reduce((_,p)=>Math.max(_,p.obs.created_at_epoch),i[0].obs.created_at_epoch),c=o.startsWith("subject:")?o.slice(8):(d.obs.title??"").replace(/\s+/g," ").trim().toLowerCase()||`obs-${d.obs.id}`;n.push({subject:c,observations:a,topByPriority:d.obs,count:a.length,lastTouched:u,topScore:d.score})}return n.sort((o,i)=>o.topScore!==i.topScore?i.topScore-o.topScore:i.lastTouched-o.lastTouched),n.map(({topScore:o,...i})=>i)}function st(){let r=new Date,e=r.toLocaleDateString("en-CA"),t=r.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=r.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function rt(r){return[`# [${r}] recent context, ${st()}`,""]}function nt(r=!1){return r?[`Legend: \u{1F3AF}session ${A.getInstance().getActiveMode().observation_types.map(s=>`${s.emoji}${s.id}`).join(" ")}`,"Format: ID TIME TYPE TITLE","Fetch details: get_observations([IDs]) | Search: mem-search skill",""]:[]}function ot(r=!1){return[]}function it(r=!1){return[]}function at(r,e){if(e.verbose){let s=[],n=[`${r.totalObservations} obs (${r.totalReadTokens.toLocaleString()}t read)`,`${r.totalDiscoveryTokens.toLocaleString()}t work`];return r.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)&&(e.showSavingsPercent?n.push(`${r.savingsPercent}% savings`):e.showSavingsAmount&&n.push(`${r.savings.toLocaleString()}t saved`)),s.push(`Stats: ${n.join(" | ")}`),s.push(""),s}let t=[`${r.totalObservations} obs`];return r.totalDiscoveryTokens>0&&r.savingsPercent>0&&t.push(`${r.savingsPercent}% recall savings`),t.push("use mem-search skill for deeper history"),[`\u{1F4CA} ${t.join(" \xB7 ")}`,""]}function dt(r){return[`### ${r}`]}function ct(r){return r.toLowerCase().replace(" am","a").replace(" pm","p")}function ut(r,e,t){let s=r.title||"Untitled",n=A.getInstance().getTypeIcon(r.type),o=e?ct(e):'"',i=r.stale?" [STALE]":"";return`${r.id} ${o} ${n} ${s}${i}`}function lt(r,e,t,s){let n=[],o=r.title||"Untitled",i=A.getInstance().getTypeIcon(r.type),a=e?ct(e):'"',{readTokens:d,discoveryDisplay:u}=F(r,s);n.push(`**${r.id}** ${a} ${i} **${o}**`),t&&n.push(t);let c=[];return s.showReadTokens&&c.push(`~${d}t`),s.showWorkTokens&&c.push(u),c.length>0&&n.push(c.join(" ")),n.push(""),n}function he(r,e){return[`S${r.id} ${r.request||"Session started"} (${e})`]}function P(r,e){return e?[`**${r}**: ${e}`,""]:[]}function _t(r){return r.assistantMessage?["","---","","**Previously**","",`A: ${r.assistantMessage}`,""]:[]}function mt(r,e){return["",`Access ${Math.round(r/1e3)}k tokens of past work via get_observations([IDs]) or mem-search skill.`]}function pt(r){return`# [${r}] recent context, ${st()}

No previous sessions found.`}function Et(){let r=new Date,e=r.toLocaleDateString("en-CA"),t=r.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),s=r.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${t} ${s}`}function gt(r){return["",`${l.bright}${l.cyan}[${r}] recent context, ${Et()}${l.reset}`,`${l.gray}${"\u2500".repeat(60)}${l.reset}`,""]}function Tt(r=!1){if(!r)return[];let t=A.getInstance().getActiveMode().observation_types.map(s=>`${s.emoji} ${s.id}`).join(" | ");return[`${l.dim}Legend: session-request | ${t}${l.reset}`,""]}function ft(r=!1){return r?[`${l.bright}Column Key${l.reset}`,`${l.dim}  Read: Tokens to read this observation (cost to learn it now)${l.reset}`,`${l.dim}  Work: Tokens spent on work that produced this record ( research, building, deciding)${l.reset}`,""]:[]}function bt(r=!1){return r?[`${l.dim}Context Index: This semantic index (titles, types, files, tokens) is usually sufficient to understand past work.${l.reset}`,"",`${l.dim}When you need implementation details, rationale, or debugging context:${l.reset}`,`${l.dim}  - Fetch by ID: get_observations([IDs]) for observations visible in this index${l.reset}`,`${l.dim}  - Search history: Use the mem-search skill for past decisions, bugs, and deeper research${l.reset}`,`${l.dim}  - Trust this index over re-reading code for past decisions and learnings${l.reset}`,""]:[]}function St(r,e){if(e.verbose){let s=[];if(s.push(`${l.bright}${l.cyan}Context Economics${l.reset}`),s.push(`${l.dim}  Loading: ${r.totalObservations} observations (${r.totalReadTokens.toLocaleString()} tokens to read)${l.reset}`),s.push(`${l.dim}  Work investment: ${r.totalDiscoveryTokens.toLocaleString()} tokens spent on research, building, and decisions${l.reset}`),r.totalDiscoveryTokens>0&&(e.showSavingsAmount||e.showSavingsPercent)){let n="  Your savings: ";e.showSavingsAmount&&e.showSavingsPercent?n+=`${r.savings.toLocaleString()} tokens (${r.savingsPercent}% reduction from reuse)`:e.showSavingsAmount?n+=`${r.savings.toLocaleString()} tokens`:n+=`${r.savingsPercent}% reduction from reuse`,s.push(`${l.green}${n}${l.reset}`)}return s.push(""),s}let t=[`${r.totalObservations} obs`];return r.totalDiscoveryTokens>0&&r.savingsPercent>0&&t.push(`${r.savingsPercent}% recall savings`),t.push("use mem-search skill for deeper history"),[`${l.dim}\u{1F4CA} ${t.join(" \xB7 ")}${l.reset}`,""]}function ht(r){return[`${l.bright}${l.cyan}${r}${l.reset}`,""]}function Ot(r){return[`${l.dim}${r}${l.reset}`]}function At(r,e,t,s){let n=r.title||"Untitled",o=A.getInstance().getTypeIcon(r.type),{readTokens:i,discoveryTokens:a,workEmoji:d}=F(r,s),u=t?`${l.dim}${e}${l.reset}`:" ".repeat(e.length),c=s.showReadTokens&&i>0?`${l.dim}(~${i}t)${l.reset}`:"",_=s.showWorkTokens&&a>0?`${l.dim}(${d} ${a.toLocaleString()}t)${l.reset}`:"";return`  ${l.dim}#${r.id}${l.reset}  ${u}  ${o}  ${n} ${c} ${_}`}function Rt(r,e,t,s,n){let o=[],i=r.title||"Untitled",a=A.getInstance().getTypeIcon(r.type),{readTokens:d,discoveryTokens:u,workEmoji:c}=F(r,n),_=t?`${l.dim}${e}${l.reset}`:" ".repeat(e.length),p=n.showReadTokens&&d>0?`${l.dim}(~${d}t)${l.reset}`:"",g=n.showWorkTokens&&u>0?`${l.dim}(${c} ${u.toLocaleString()}t)${l.reset}`:"";return o.push(`  ${l.dim}#${r.id}${l.reset}  ${_}  ${a}  ${l.bright}${i}${l.reset}`),s&&o.push(`    ${l.dim}${s}${l.reset}`),(p||g)&&o.push(`    ${p} ${g}`),o.push(""),o}function Oe(r,e){let t=`${r.request||"Session started"} (${e})`;return[`${l.yellow}#S${r.id}${l.reset} ${t}`,""]}function G(r,e,t){return e?[`${t}${r}:${l.reset} ${e}`,""]:[]}function Ct(r){return r.assistantMessage?["","---","",`${l.bright}${l.magenta}Previously${l.reset}`,"",`${l.dim}A: ${r.assistantMessage}${l.reset}`,""]:[]}function Nt(r,e){let t=Math.round(r/1e3);return["",`${l.dim}Access ${t}k tokens of past research & decisions for just ${e.toLocaleString()}t. Use the claude-mem skill to access memories by ID.${l.reset}`]}function It(r){return`
${l.bright}${l.cyan}[${r}] recent context, ${Et()}${l.reset}
${l.gray}${"\u2500".repeat(60)}${l.reset}

${l.dim}No previous sessions found for this project yet.${l.reset}
`}function Lt(r,e,t,s){let n=[];return s?n.push(...gt(r)):n.push(...rt(r)),s?n.push(...Tt(t.verbose)):n.push(...nt(t.verbose)),s?n.push(...ft(t.verbose)):n.push(...ot(t.verbose)),s?n.push(...bt(t.verbose)):n.push(...it(t.verbose)),J(t)&&(s?n.push(...St(e,t)):n.push(...at(e,t))),n}var Mt=require("child_process"),Ns=500,yt=80,vt="\u2026",Is="\u{1F4CD}";function Ls(r){return e=>(0,Mt.execFileSync)("git",[...e],{cwd:r,timeout:Ns,encoding:"utf-8",stdio:["pipe","pipe","pipe"]})}function H(r,e){try{return r(e).trim()}catch{return null}}function ys(r){let e=H(r,["rev-parse","--abbrev-ref","HEAD"]);return e===null?null:e==="HEAD"?"(detached)":e}function vs(r){let e=H(r,["status","--porcelain"]);return e===null?null:e.length===0?0:e.split(`
`).filter(t=>t.trim().length>0).length}function Ms(r){for(let e of["main","master"]){let t=H(r,["rev-list","--left-right","--count",`${e}...HEAD`]);if(t===null)continue;let s=t.trim().split("	");if(s.length!==2)continue;let n=parseInt(s[0],10),o=parseInt(s[1],10);if(!(Number.isNaN(n)||Number.isNaN(o)))return{ahead:o,behind:n,baseBranch:e}}return null}function Ds(r){let e=H(r,["log","-1","--format=%cr|%s"]);if(e===null||e.length===0)return null;let t=e.indexOf("|");if(t<=0)return null;let s=e.slice(0,t).trim(),n=e.slice(t+1).trim();if(!s||!n)return null;let o=Array.from(n),i=o.length>yt?o.slice(0,yt-vt.length).join("")+vt:n;return{relativeTime:s,subject:i}}function xs(r,e,t,s){if(!e)return null;let n=[r,e];return t!==null&&n.push(t===0?"clean":`${t} dirty`),s&&(s.ahead>0||s.behind>0)&&n.push(`${s.ahead} ahead/${s.behind} behind ${s.baseBranch}`),`${Is} ${n.join(" \xB7 ")}`}function Dt(r,e,t){if(!r||!e)return null;let s=t??Ls(r);if(H(s,["rev-parse","--is-inside-work-tree"])!=="true")return null;let o=ys(s);if(!o)return null;let i=vs(s),a=Ms(s),d=Ds(s),u=xs(e,o,i,a);if(!u)return null;if(!d)return u;let c=`   Last commit (${d.relativeTime}): ${d.subject}`;return`${u}
${c}`}var Us=[{kind:"todo",regex:/\bTODO\b[:\s]+([^.\n!?]{10,200})/gi},{kind:"fixme",regex:/\bFIXME\b[:\s]+([^.\n!?]{10,200})/gi},{kind:"blocker",regex:/\bblocked by\b\s+([^.\n!?]{10,200})/gi},{kind:"decision_needed",regex:/\bdecide whether\b\s+([^.\n!?]{10,200})/gi},{kind:"unresolved_question",regex:/\bstill\s+(?:need|missing|unresolved)\s+([^.\n!?]{10,200})/gi},{kind:"unresolved_question",regex:/\bopen question\b[:\s]+([^.\n!?]{10,200})/gi}],ws=200;function ks(r){if(!r)return[];try{let e=JSON.parse(r);return Array.isArray(e)?e.filter(t=>typeof t=="string"):[]}catch{return[]}}function $s(r,e){if(!r)return[];let t=[];for(let{kind:s,regex:n}of Us){n.lastIndex=0;let o;for(;(o=n.exec(r))!==null;){let a=(o[1]??"").trim().slice(0,ws);a.length!==0&&t.push({kind:s,text:a,observationId:e})}}return t}function xt(r){let e=[];r.narrative&&e.push(r.narrative);for(let s of ks(r.facts))e.push(s);let t=[];for(let s of e)t.push(...$s(s,r.id));return t}var Fs="\u{1F6A7} Pending decisions / blockers",Ps="  ",Gs="  ",Hs=100,Ut="\u2026",Xs=.7,wt=500;function js(r){return r.toLowerCase().trim().replace(/^[^\p{L}\p{N}\s]+/u,"").replace(/[^\p{L}\p{N}\s]+$/u,"").trim()}function kt(r){return r?r.split(/\s+/u).filter(e=>e.length>0):[]}function Bs(r,e){if(r.length===0||e.length===0)return 0;let t=new Set(r),s=new Set(e),n=0;for(let i of t)s.has(i)&&n++;let o=t.size+s.size-n;return o===0?0:n/o}function Ws(r){let e=[];e:for(let t of r){let s=kt(t.normalized);for(let n=0;n<e.length;n++){let o=e[n],i=o.normalized.includes(t.normalized),a=t.normalized.includes(o.normalized);if(i||a){let c=t.normalized.length,_=o.normalized.length;(c>_||c===_&&t.signal.observationId<o.signal.observationId)&&(e[n]=t);continue e}let d=kt(o.normalized);if(Bs(s,d)>=Xs){t.signal.observationId<o.signal.observationId&&(e[n]=t);continue e}}e.push(t)}return e}function qs(r,e){if(r.kind==="decision_needed")return"decide whether: ";if(r.kind==="unresolved_question"){let t=`${e.narrative??""}
${e.facts??""}`.toLowerCase(),s=t.indexOf(r.text.toLowerCase());if(s>0){let n=t.slice(Math.max(0,s-30),s);if(/\bopen question\b/.test(n))return"open question: "}return""}return""}function Ks(r,e){let t=Array.from(r);if(t.length<=e)return r;let s=Math.max(1,e-Ut.length);return t.slice(0,s).join("")+Ut}function Vs(r){let{signal:e,obs:t}=r,n=`${qs(e,t)}${e.text}`,o=Ks(n,Hs),i=D(t.created_at);return`${Ps}- ${o} (#${t.id} \xB7 ${i})`}function $t(r,e){if(r.length===0)return null;let t=new Map,s=[];for(let c of r){t.set(c.id,c);let _;try{_=xt(c)}catch{continue}for(let p of _){let g=js(p.text);g&&s.push({signal:p,obs:c,normalized:g})}}if(s.length===0)return null;let n=s;s.length>wt&&(n=s.slice().sort((c,_)=>c.obs.created_at_epoch!==_.obs.created_at_epoch?_.obs.created_at_epoch-c.obs.created_at_epoch:_.signal.observationId-c.signal.observationId).slice(0,wt));let o=Ws(n);if(o.length===0)return null;o.sort((c,_)=>c.obs.created_at_epoch!==_.obs.created_at_epoch?_.obs.created_at_epoch-c.obs.created_at_epoch:_.signal.observationId-c.signal.observationId);let i=Math.max(1,e.maxBlockers),a=o.slice(0,i),d=o.length-a.length,u=[Fs];for(let c of a)u.push(Vs(c));return d>0&&u.push(`${Gs}+ ${d} more`),u.join(`
`)}function Ys(r){let e=new Map;for(let s of r){let n=s.type==="observation"?s.data.created_at:s.data.displayTime,o=qe(n);e.has(o)||e.set(o,[]),e.get(o).push(s)}let t=Array.from(e.entries()).sort((s,n)=>{let o=new Date(s[0]).getTime(),i=new Date(n[0]).getTime();return o-i});return new Map(t)}function Pt(r,e){return e.fullObservationField==="narrative"?r.narrative:r.facts?L(r.facts).join(`
`):null}function Js(r,e,t,s){let n=[];n.push(...dt(r));let o="";for(let i of e)if(i.type==="summary"){let a=i.data,d=z(a.displayTime);n.push(...he(a,d))}else{let a=i.data,d=D(a.created_at),c=d!==o?d:"";if(o=d,t.has(a.id)){let p=Pt(a,s);n.push(...lt(a,c,p,s))}else n.push(ut(a,c,s))}return n}function zs(r,e,t,s,n){let o=[];o.push(...ht(r));let i=null,a="";for(let d of e)if(d.type==="summary"){i=null,a="";let u=d.data,c=z(u.displayTime);o.push(...Oe(u,c))}else{let u=d.data,c=Ke(u.files_modified,n,u.files_read),_=D(u.created_at),p=_!==a;a=_;let g=t.has(u.id);if(c!==i&&(o.push(...Ot(c)),i=c),g){let h=Pt(u,s);o.push(...Rt(u,_,p,h,s))}else o.push(At(u,_,p,s))}return o.push(""),o}function Qs(r,e,t,s,n,o){return o?zs(r,e,t,s,n):Js(r,e,t,s)}function Gt(r,e,t,s,n){let o=[],i=Ys(r);for(let[a,d]of i)o.push(...Qs(a,d,e,t,s,n));return o}var Zs="  ",Ae="        ",er=30,Ft=3;function tr(r,e){let t=Array.from(r);return t.length<=e?r:t.slice(0,Math.max(1,e-1)).join("")+"\u2026"}function sr(r){return r.count<=1||r.count>Ft+1?"":r.observations.slice(1,1+Ft).map(t=>tr((t.title??"untitled").trim(),er)).join(", ")}function rr(r,e){return e.fullObservationField==="narrative"?r.narrative:r.facts?L(r.facts).join(`
`):null}function nr(r,e,t){let s=r.topByPriority,n=A.getInstance(),o=n.getTypeIcon(s.type),i=D(r.lastTouched),a=[];a.push(`${o} ${r.subject} (${r.count} obs \xB7 last ${i})`);let d=n.getTypeIcon(s.type),u=(s.title??"Untitled").trim()||"Untitled",c=s.stale?" [STALE]":"";if(a.push(`${Zs}${d}  #${s.id}  ${u}${c}`),r.count>1){let _=sr(r),p=r.count-1,g=_?`${Ae}+ ${p} supporting: ${_}`:`${Ae}+ ${p} supporting`;a.push(g)}if(e.has(s.id)){let _=rr(s,t);if(_){let p=_.replace(/\s+/g," ").trim();a.push(`${Ae}Full narrative: ${p}`)}}return a}function Ht(r,e,t,s,n){let o=[];for(let a of r)o.push(...nr(a,t,s)),o.push("");let i=[...e].sort((a,d)=>d.displayEpoch-a.displayEpoch);for(let a of i){let d=z(a.displayTime);n?o.push(...Oe(a,d)):o.push(...he(a,d))}return o}function Xt(r,e,t){return!(!r.showLastSummary||!e||!!!(e.investigated||e.learned||e.completed||e.next_steps)||t&&e.created_at_epoch<=t.created_at_epoch)}function jt(r,e){let t=[];return e?(t.push(...G("Investigated",r.investigated,l.blue)),t.push(...G("Learned",r.learned,l.yellow)),t.push(...G("Completed",r.completed,l.green)),t.push(...G("Next Steps",r.next_steps,l.magenta))):(t.push(...P("Investigated",r.investigated)),t.push(...P("Learned",r.learned)),t.push(...P("Completed",r.completed)),t.push(...P("Next Steps",r.next_steps))),t}function Bt(r,e){return e?Ct(r):_t(r)}function Wt(r,e,t){return!J(e)||r.totalDiscoveryTokens<=0||r.savings<=0?[]:t?Nt(r.totalDiscoveryTokens,r.totalReadTokens):mt(r.totalDiscoveryTokens,r.totalReadTokens)}var or=qt.default.join((0,Kt.homedir)(),".claude","plugins","marketplaces","thedotmack","plugin",".install-version");function ir(){try{return new K}catch(r){if(r instanceof Error&&r.code==="ERR_DLOPEN_FAILED"){try{(0,Vt.unlinkSync)(or)}catch(e){e instanceof Error?m.debug("WORKER","Marker file cleanup failed (may not exist)",{},e):m.debug("WORKER","Marker file cleanup failed (may not exist)",{error:String(e)})}return m.error("WORKER","Native module rebuild needed - restart Claude Code to auto-fix"),null}throw r}}function ar(r,e){return e?It(r):pt(r)}function dr(r,e,t,s,n,o,i,a,d,u){let c=[],_=_e(e);a&&c.push(a,""),d&&c.push(d,""),c.push(...Lt(r,_,s,i));let p=t.slice(0,s.sessionCount),g=ze(p,t),h=Qe(e,s.fullObservationCount);if(u)c.push(...Ht(u,g,h,s,i));else{let T=be(e,g);c.push(...Gt(T,h,s,n,i))}let C=t[0],E=e[0];Xt(s,C,E)&&c.push(...jt(C,i));let S=fe(e,s,o,n);return c.push(...Bt(S,i)),c.push(...Wt(_,s,i)),c.join(`
`).trimEnd()}async function Re(r,e=!1){let t=ce(),s=r?.cwd??process.cwd(),n=oe(s),o=r?.projects?.length?r.projects:n.allProjects,i=o[o.length-1]??n.primary;r?.full&&(t.totalObservationCount=999999,t.sessionCount=999999,t.includeStale=!0);let a=ir();if(!a)return"";try{let d=o.length>1?Ye(a,o,t):ge(a,i,t),u=o.length>1?Je(a,o,t):Te(a,i,t),c=Date.now(),_=t.priorityRanking||t.subjectClustering?Ze(d,c):void 0,p=t.priorityRanking?et(d,c,_):d;if(p.length===0&&u.length===0)return ar(i,e);let g=t.showStateHeader?Dt(s,i):null,h=t.showBlockers?$t(p,t):null,C=t.subjectClustering?tt(p,c,_):null,E=dr(i,p,u,t,s,r?.session_id,e,g,h,C);if(t.contextBudgetTokens>0&&!r?.full){let S=t.contextBudgetTokens*4;if(E.length>S){let T=E.lastIndexOf(`
`,S);return(T>0?E.slice(0,T):E.slice(0,S))+`
[context truncated to ${t.contextBudgetTokens}-token budget]`}}return E}finally{a.close()}}0&&(module.exports={generateContext});
