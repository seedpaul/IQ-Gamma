export class ItemExclusionStore{
  constructor(key="chc_cat_exclusions_v1"){
    this.key = key;
    this.state = this._load();
  }

  _load(){
    try{
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : { excluded: {} };
    }catch{
      return { excluded: {} };
    }
  }

  _save(){
    try{ localStorage.setItem(this.key, JSON.stringify(this.state)); }catch{}
  }

  isExcluded(itemId){
    return !!this.state.excluded[itemId];
  }

  exclude(itemId, reason="DIF_SUSPECT"){
    this.state.excluded[itemId] = { itemId, reason, at: new Date().toISOString() };
    this._save();
  }

  include(itemId){
    delete this.state.excluded[itemId];
    this._save();
  }

  list(){
    return Object.values(this.state.excluded);
  }

  getExcludedIds(){
    return Object.keys(this.state.excluded);
  }

  clear(){
    this.state = { excluded: {} };
    this._save();
  }
}
