import React, {forwardRef, useState} from 'react';
import {InputNumber, Button, Icon} from 'antd';

const InputRate = (props, ref) => {
  const [disabled, setDisabled] = useState(true);
  const {
    style,
    min,
    precision,
    value,
    onChange,
    setRate
  } = props;

  const onClickEdit = (e) => {
    e.preventDefault();
    setDisabled(false);
  };

  const onClickSet = (e) => {
    e.preventDefault();
    if(setRate()){
      setDisabled(true);
    };
  };

  return (
    <div className="input-rate" style={style} ref={ref}>
      <InputNumber
        min={min}
        precision={precision}
        onChange={onChange}
        value={value}
        disabled={disabled}
      />
      <Button icon="edit" onClick={onClickEdit}/>
      <Button onClick={onClickSet}>Set</Button>
    </div>
  );
};

export default forwardRef(InputRate);
