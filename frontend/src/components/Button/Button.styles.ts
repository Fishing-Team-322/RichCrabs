import styled, { css } from 'styled-components';

interface StyledButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';
  fullWidth?: boolean;
  disabled?: boolean;
}

export const StyledButton = styled.button<StyledButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  transition: all 0.2s ease;
  width: ${({ fullWidth }) => (fullWidth ? '100%' : 'auto')};
  
  ${({ variant = 'primary', theme }) => {
    switch (variant) {
      case 'primary':
        return css`
          background-color: ${theme.colors.primary};
          color: ${theme.colors.white};
          &:hover:not(:disabled) {
            opacity: 0.9;
          }
        `;
      case 'secondary':
        return css`
          background-color: transparent;
          color: ${theme.colors.primary};
          border: 2px solid ${theme.colors.primary};
          &:hover:not(:disabled) {
            background-color: ${theme.colors.primary};
            color: ${theme.colors.white};
          }
        `;
      case 'outline':
        return css`
          background-color: transparent;
          color: ${theme.colors.white};
          border: 1px solid ${theme.colors.gray};
          &:hover:not(:disabled) {
            border-color: ${theme.colors.primary};
          }
        `;
      default:
        return '';
    }
  }}
  
  &:disabled {
    opacity: 0.5;
  }
`;