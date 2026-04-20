const userStates = new Map();

const States = {
  AWAITING_REGISTER_USERNAME: 'awaiting_register_username',
  AWAITING_REGISTER_PASSWORD: 'awaiting_register_password',
  AWAITING_LOGIN_USERNAME: 'awaiting_login_username',
  AWAITING_LOGIN_PASSWORD: 'awaiting_login_password',
};

function setUserState(chatId, state, tempData = {}) {
  userStates.set(chatId, { state, tempData });
}

function getUserState(chatId) {
  return userStates.get(chatId);
}

function clearUserState(chatId) {
  userStates.delete(chatId);
}

module.exports = { userStates, States, setUserState, getUserState, clearUserState };