# Contexto do projeto

Trabalho de faculdade (Computação Gráfica) com os seguintes requisitos
OBRIGATÓRIOS que devem ser respeitados em qualquer sugestão futura:

- A aplicação DEVE usar WebGPU para processamento gráfico (pré-requisito
  inegociável — sem isso a nota zera).
- Deve incluir pelo menos um efeito de shader (partículas ou iluminação)
  obtido de uma fonte EXTERNA da internet, adaptado e com a fonte
  documentada. IMPLEMENTADO: explosão ao acertar o alvo, em
  src/explosion.js (fonte e licença no cabeçalho do arquivo).
- NÃO PODE ter como processamento principal da GPU: redes neurais,
  blockchain, ou qualquer uso não-gráfico. Nunca sugerir isso.
- A aplicação deve estar funcional e estável no dia da apresentação
  (05/10/2026).
- O processo de desenvolvimento com IA (prompts, respostas, erros,
  correções) precisa ficar documentado — por isso, sempre que corrigir
  um bug ou tomar uma decisão técnica não-trivial, escreva uma mensagem
  de commit git clara e descritiva explicando o problema e a correção
  (isso vira evidência de documentação depois).
- Prazo é curto (~10 dias). Priorize sempre a solução mais simples que
  funcione sobre a mais elegante.

## Registro de prompts e respostas

A cada prompt que eu (Claude Code) receber deste projeto a partir de
agora, registre em um arquivo separado chamado docs/ai-log.md (crie a
pasta docs/ se não existir) uma entrada com:

- Data/hora
- Resumo curto do prompt recebido (1-3 linhas, não precisa copiar
  o prompt inteiro)
- Resumo do que foi feito em resposta (o que foi criado/alterado,
  decisões técnicas tomadas)
- Arquivos modificados
- Problemas encontrados nesse prompt e como foram resolvidos, se houver

Esse arquivo serve para documentação do processo de uso de IA exigida
no trabalho, então mantenha as entradas objetivas e cronológicas
(mais recente no final do arquivo).
