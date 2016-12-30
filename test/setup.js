const storageMock = () => {
  const storage = {};

  return {
    setItem(key, value) {
      storage[key] = value || '';
    },
    getItem(key) {
      return storage[key] || null;
    },
    removeItem(key) {
      delete storage[key];
    },
    get length() {
      return Object.keys(storage).length;
    },
    key(i) {
      const keys = Object.keys(storage);
      return keys[i] || null;
    },
  };
};

Object.defineProperty(window, 'localStorage',   { value: storageMock() });
Object.defineProperty(window, 'sessionStorage', { value: storageMock() });
