import styled, { css } from 'styled-components';

type ThemePalette = { colors: Record<string, string> }

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
    const palette = (theme as ThemePalette).colors

    switch (variant) {
      case 'primary':
        return css`
          background-color: ${palette.primary};
          color: ${palette.textPrimary};
          &:hover:not(:disabled) {
            opacity: 0.9;
          }
        `;
      case 'secondary':
        return css`
          background-color: transparent;
          color: ${palette.primary};
          border: 2px solid ${palette.primary};
          &:hover:not(:disabled) {
            background-color: ${palette.primary};
            color: ${palette.textPrimary};
          }
        `;
      case 'outline':
        return css`
          background-color: transparent;
          color: ${palette.textPrimary};
          border: 1px solid ${palette.border};
          &:hover:not(:disabled) {
            border-color: ${palette.primary};
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