import React from 'react';

export const Button: React.FC<React.PropsWithChildren<{ onClick?: () => void }>> = ({ children, onClick }) => (
  <button onClick={onClick} style={{ padding: 8, border: '1px solid #ccc', borderRadius: 4 }}>{children}</button>
);

