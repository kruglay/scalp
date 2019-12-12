
const sleep = async (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const asyncSetTimeOut = async function(func, delay) {
  await sleep(delay);
  await func();
};

module.exports = {
  sleep,
  asyncSetTimeOut
};

