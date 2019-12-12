import {message} from 'antd';

export default (type, text, duration = 1.5, onClose) => {
  message[type](text, duration, onClose);
}
