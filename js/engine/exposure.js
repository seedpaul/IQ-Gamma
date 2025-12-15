export class ExposureStore{
  constructor(key="chc_cat_exposure_v1"){
    this.key = key;
    this.state = this._load();
  }

  _load(){
    try{
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : { items: {}, updated: Date.now() };
    }catch{
      return { items: {}, updated: Date.now() };
    }
  }

  _save(){
    try{
      this.state.updated = Date.now();
      localStorage.setItem(this.key, JSON.stringify(this.state));
    }catch{
      // ignore storage errors
    }
  }

  getCount(itemId){
    return this.state.items[itemId] ?? 0;
  }

  bump(itemId){
    this.state.items[itemId] = (this.state.items[itemId] ?? 0) + 1;
    this._save();
  }
}
