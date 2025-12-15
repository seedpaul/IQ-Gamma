import { uuid } from "../engine/utils.js";

export class SessionStore{
  constructor(key="chc_cat_sessions_v1"){
    this.key = key;
    this.state = this._load();
  }

  _load(){
    try{
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : { sessions: {}, order: [] };
    }catch{
      return { sessions: {}, order: [] };
    }
  }

  _save(){
    try{
      localStorage.setItem(this.key, JSON.stringify(this.state));
    }catch{
      // ignore
    }
  }

  createSession(meta){
    const id = uuid();
    const session = {
      id,
      createdAt: new Date().toISOString(),
      meta: meta ?? {},
      events: [],
      completed: false
    };
    this.state.sessions[id] = session;
    this.state.order.unshift(id);
    this._save();
    return id;
  }

  appendEvent(sessionId, evt){
    const s = this.state.sessions[sessionId];
    if (!s) return;
    s.events.push({ ...evt, at: new Date().toISOString() });
    this._save();
  }

  markCompleted(sessionId){
    const s = this.state.sessions[sessionId];
    if (!s) return;
    s.completed = true;
    s.completedAt = new Date().toISOString();
    this._save();
  }

  get(sessionId){
    return this.state.sessions[sessionId] ?? null;
  }

  list({ limit=25 } = {}){
    return this.state.order.slice(0, limit).map(id => this.state.sessions[id]).filter(Boolean);
  }

  exportSession(sessionId){
    const s = this.get(sessionId);
    return s ? structuredClone(s) : null;
  }

  exportAll(){
    return structuredClone(this.state);
  }

  clear(){
    this.state = { sessions: {}, order: [] };
    this._save();
  }
}
